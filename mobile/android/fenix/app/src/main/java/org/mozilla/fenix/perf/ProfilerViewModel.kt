/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.annotation.StringRes
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mozilla.components.concept.base.profiler.Profiler
import mozilla.components.support.base.log.Log
import org.json.JSONException
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

/**
 * Represents the various states of the profiler UI.
 *
 * This sealed class encapsulates all possible states that the profiler interface
 * can be in, providing a type-safe way to handle state transitions and UI updates.
 */
sealed class ProfilerUiState {

    /** The profiler is idle and ready to start */
    data object Idle : ProfilerUiState()

    /** The profiler is in the process of starting up */
    data object Starting : ProfilerUiState()

    /** The profiler is active and "profiling" */
    data object Running : ProfilerUiState()

    /** The profiler is gathering and processing collected data */
    data object Gathering : ProfilerUiState()

    /** The profiler is in the process of shutting down */
    data object Stopping : ProfilerUiState()

    /**
     * A toast message should be displayed to the user.
     *
     * @property messageResId String resource ID for the toast message
     * @property extra Additional optional text to include in the toast
     */
    data class ShowToast(@param:StringRes val messageResId: Int, val extra: String = "") :
        ProfilerUiState()

    /**
     * The profiling session has finished.
     *
     * @property profileUrl The URL where the profile can be viewed, or null if not saved
     */
    data class Finished(val profileUrl: String?) : ProfilerUiState()

    /**
     * An error occurred during profiling.
     *
     * @property messageResId String resource ID for the error message
     * @property errorDetails Additional error details for debugging (optional)
     */
    data class Error(@param:StringRes val messageResId: Int, val errorDetails: String = "") :
        ProfilerUiState()

    /** The required notification permission was denied by the user */
    object PermissionDenied : ProfilerUiState()

    /** The UI should show a rationale for requesting notification permission */
    object NeedsPermissionRationale : ProfilerUiState()

    /**
     * Determines whether the dialog should be dismissed.
     *
     * @return true if the dialog should be dismissed, false if it should remain open
     */
    fun shouldDismiss(): Boolean {
        return this is Running ||
                this is Finished ||
                this is Error ||
                this is PermissionDenied
    }
}

/**
 * Factory for creating ProfilerViewModel instances with injectable coroutine dispatchers. The main
 * goal is to facilitate unit testing. In tests, real dispatchers
 * like [Dispatchers.Main] and [Dispatchers.IO] can be replaced with test dispatchers
 * for deterministic and synchronous execution as mentioned in the
 * [Testing Kotlin coroutines on Android]
 * (https://developer.android.com/kotlin/coroutines/test#invoking-suspending-functions).
 */
class ProfilerViewModelFactory(
    private val application: Application,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ProfilerViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ProfilerViewModel(application, mainDispatcher, ioDispatcher) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}

/**
 * ViewModel for managing profiler operations and UI state.
 *
 * This ViewModel handles the complete lifecycle of performance profiling sessions,
 * including starting/stopping the profiler, managing permissions, handling background
 * services, and coordinating profile data upload. Note: The actual state of the profiler is not
 * managed by the viewModel. This is merely a reflection of the state of the Profiler within Gecko.
 */
class ProfilerViewModel(
    private val application: Application,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val profilerUtils: ProfilerUtils = ProfilerUtils,
) : AndroidViewModel(application) {

    private val delayToUpdateStatus = 50L
    private val profiler: Profiler? = application.components.core.engine.profiler

    private val _isProfilerActive = MutableStateFlow(profiler?.isProfilerActive() ?: false)
    val isProfilerActive: StateFlow<Boolean> = _isProfilerActive.asStateFlow()

    private val _uiState = MutableStateFlow<ProfilerUiState>(ProfilerUiState.Idle)
    val uiState: StateFlow<ProfilerUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null
    private val delayToPollProfilerForStatus = 100L

    /**
     * Updates the profiler active status by checking the current state by synchronizing
     *  the ViewModel's internal state with the actual profiler state to ensure consistency
     *  between the UI and the profiler engine.
     */
    fun updateProfilerActiveStatus() {
        val currentlyActive = profiler?.isProfilerActive() ?: false
        if (_isProfilerActive.value != currentlyActive) {
            _isProfilerActive.value = currentlyActive
        }
    }

    /**
     * Polls the profiler status until it becomes active or the operation is cancelled.
     * Once active, it triggers permission checking and updates the UI state accordingly.
     */
    private fun pollUntilProfilerActive() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch(ioDispatcher) {
            try {
                while (isActive) {
                    if (profiler?.isProfilerActive() == true) {
                        withContext(mainDispatcher) {
                            if (!_isProfilerActive.value) {
                                _isProfilerActive.value = true
                            }
                            checkAndRequestPermissionIfNeeded()
                        }
                        break
                    }
                    delay(delayToPollProfilerForStatus)
                }
            } catch (e: CancellationException) {
                withContext(mainDispatcher) {
                    if (_uiState.value == ProfilerUiState.Starting) {
                        _uiState.value =
                            ProfilerUiState.Idle
                    }
                }
                throw e
            } catch (e: IOException) {
                handleViewModelError(e, R.string.profiler_error, "Polling failed")
            } catch (e: SecurityException) {
                handleViewModelError(e, R.string.profiler_error, "Permission denied")
            } catch (e: IllegalStateException) {
                handleViewModelError(e, R.string.profiler_error, "Invalid profiler state")
            }
        }
    }

    /**
     * Starts the profiler with the specified settings.
     *
     * @param settings The profiler configuration including threads and features to monitor
     */
    fun startProfiler(settings: ProfilerSettings) {
        if (profiler == null) {
            _uiState.value =
                ProfilerUiState.Error(R.string.profiler_error, "Profiler not available"); return
        }
        if (isProfilerActive.value) {
            _uiState.value = ProfilerUiState.Running; return
        }
        _uiState.value = ProfilerUiState.Starting
        profiler.startProfiler(settings.threads, settings.features)
        pollUntilProfilerActive()
    }

    /**
     * Checks notification permissions and requests them if needed, or starts the foreground service.
     *
     * On Android 13+ (API 33+), notification permission is required for foreground services.
     * This method either proceeds with starting the service or triggers the permission request flow.
     */
    fun checkAndRequestPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || profilerUtils.hasNotificationPermission(
                application,
            )
        ) {
            startForegroundServiceAndNotify()
        } else {
            _uiState.value = ProfilerUiState.NeedsPermissionRationale
        }
    }

    /**
     * Starts the profiler foreground service. The delay of 50ms is arbitrary to handle a race condition
     * between the profiler starting and the service being started.
     */
    private fun startForegroundServiceAndNotify() {
        try {
            val startIntent = Intent(application, ProfilerService::class.java).apply {
                action = ProfilerService.ACTION_START_PROFILING
            }
            ContextCompat.startForegroundService(application, startIntent)
            _uiState.value = ProfilerUiState.ShowToast(R.string.profiler_start_dialog_started)
            viewModelScope.launch {
                delay(delayToUpdateStatus)
                if (isProfilerActive.value) {
                    _uiState.value = ProfilerUiState.Running
                }
            }
        } catch (e: IllegalStateException) {
            _uiState.value =
                ProfilerUiState.Error(R.string.profiler_error, "Service start failed: ${e.message}")
        }
    }

    /**
     * Processes the user's response to the notification permission request
     * and either proceeds with starting the service or handles the denial.
     *
     * @param granted true if the permission was granted, false otherwise
     */
    fun onPermissionResult(granted: Boolean) {
        viewModelScope.launch {
            if (granted) {
                startForegroundServiceAndNotify()
            } else {
                handlePermissionDenial()
            }
        }
    }

    /**
     * Updates the UI state to indicate permission denial and then transitions
     * to an appropriate state based on the current profiler status.
     */
    private fun handlePermissionDenial() {
        _uiState.value = ProfilerUiState.PermissionDenied
        viewModelScope.launch {
            delay(delayToUpdateStatus)
            if (isProfilerActive.value) {
                _uiState.value = ProfilerUiState.Running
            } else {
                _uiState.value = ProfilerUiState.Idle
            }
        }
    }

    /**
     * Stops the profiler  and saves the collected profile data by attempting to upload the
     * gathered data. The resulting URL is copied to the clipboard for easy sharing.
     */
    fun stopProfilerAndSave() {
        if (profiler == null || !isProfilerActive.value) {
            updateProfilerActiveStatus()
            _uiState.value = ProfilerUiState.Finished(null)
            return
        }
        _uiState.value = ProfilerUiState.Gathering
        _isProfilerActive.value = false
        profiler.stopProfiler(
            onSuccess = { profileData ->
                viewModelScope.launch(mainDispatcher) {
                    stopNotificationServiceInternal()
                    if (profileData != null) {
                        handleProfileSaveInternal(profileData)
                    } else {
                        _uiState.value = ProfilerUiState.Error(R.string.profiler_no_info)
                    }
                }
            },
            onError = { error ->
                viewModelScope.launch(mainDispatcher) {
                    stopNotificationServiceInternal()
                    updateProfilerActiveStatus()
                    val errorMessage = error.message ?: "Unknown stop error"
                    _uiState.value = ProfilerUiState.Error(R.string.profiler_error, errorMessage)
                }
            },
        )
    }

    /**
     * Stops the profiler without saving the collected data. It
     * terminates the profiling session and discards any gathered the data.
     */
    fun stopProfilerWithoutSaving() {
        if (profiler == null || !isProfilerActive.value) {
            updateProfilerActiveStatus()
            _uiState.value = ProfilerUiState.Finished(null)
            return
        }
        _uiState.value = ProfilerUiState.Stopping
        _isProfilerActive.value = false
        profiler.stopProfiler(
            onSuccess = {
                viewModelScope.launch(mainDispatcher) {
                    stopNotificationServiceInternal()
                    _uiState.value = ProfilerUiState.Finished(null)
                }
            },
            onError = { error ->
                viewModelScope.launch(mainDispatcher) {
                    stopNotificationServiceInternal()
                    updateProfilerActiveStatus()
                    val errorMessage = error.message ?: "Unknown stop error"
                    _uiState.value = ProfilerUiState.Error(R.string.profiler_error, errorMessage)
                }
            },
        )
    }

    /**
     * Handles the internal process of saving profile data to the server.
     *
     * @param profileData The compressed profile data as ByteArray
     */
    private fun handleProfileSaveInternal(profileData: ByteArray) {
        viewModelScope.launch(ioDispatcher) {
            try {
                val url = profilerUtils.saveProfileUrlToClipboard(profileData, application)
                withContext(mainDispatcher) {
                    profilerUtils.finishProfileSave(application, url) { messageResId ->
                        _uiState.value = ProfilerUiState.ShowToast(messageResId)
                        launch {
                            delay(delayToUpdateStatus)
                            _uiState.value = ProfilerUiState.Finished(url)
                        }
                    }
                }
            } catch (e: IOException) {
                handleViewModelError(e, R.string.profiler_io_error, "Upload failed")
            } catch (e: SecurityException) {
                handleViewModelError(e, R.string.profiler_io_error, "Permission denied")
            } catch (e: JSONException) {
                handleViewModelError(e, R.string.profiler_io_error, "Server response invalid")
            } catch (e: IllegalArgumentException) {
                handleViewModelError(e, R.string.profiler_io_error, "Invalid profile data")
            }
        }
    }

    /**
     * Stops the profiler notification services by sending a stop intent to the ProfilerService to \
     * terminate the foreground service and remove the persistent notification.
     */
    private fun stopNotificationServiceInternal() {
        try {
            val stopIntent = Intent(application, ProfilerService::class.java).apply {
                action = ProfilerService.ACTION_STOP_PROFILING
            }
            ContextCompat.startForegroundService(application, stopIntent)
        } catch (e: IllegalStateException) {
            Log.log(
                priority = Log.Priority.ERROR,
                tag = "ProfilerViewModel",
                message = "Error sending stop intent: ${e.message}",
            )
        }
    }

    /**
     * Resets the UI state to idle if it isn't already.
     */
    fun resetUiState() {
        if (_uiState.value != ProfilerUiState.Idle) {
            _uiState.value = ProfilerUiState.Idle
        }
    }

    /**
     * Cancels any ongoing polling operations when the ViewModel is cleared.
     */
    override fun onCleared() {
        super.onCleared()
        pollingJob?.cancel()
    }

    /**
     * Handles errors that occur during polling and save operations.
     */
    private suspend fun handleViewModelError(
        exception: Exception,
        @StringRes errorMessageRes: Int,
        fallbackMessage: String = "Operation failed",
    ) {
        Log.log(
            priority = Log.Priority.ERROR,
            tag = "ProfilerViewModel",
            message = "Error: ${exception.message}",
        )
        withContext(Dispatchers.Main) {
            _uiState.value = ProfilerUiState.Error(
                errorMessageRes,
                exception.message ?: fallbackMessage,
            )
        }
    }
}
