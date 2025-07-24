/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.qrScanner

import android.Manifest
import android.content.DialogInterface
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.SpannableString
import androidx.annotation.VisibleForTesting
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.feature.qr.QrFeature
import mozilla.components.support.ktx.android.content.isPermissionGranted
import mozilla.components.support.ktx.android.view.hideKeyboard
import mozilla.components.support.ktx.android.view.showKeyboard
import mozilla.components.ui.widgets.withCenterAlignedButtons
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.ext.getRootView
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.utils.Settings

/**
 * Delegate for lazy creating the QR Scanner feature for the toolbar.
 *
 * @property activity [AppCompatActivity] that the [QrFeature] is attached to.
 * @property appStore [AppStore] for receiving [AppAction] dispatches.
 * @property browserStore [BrowserStore] for dispatching engagement state changes.
 * @property settings [Settings] for observing camera permissions.
 */
class QrScannerDelegate(
    val activity: AppCompatActivity,
    val appStore: AppStore,
    val browserStore: BrowserStore,
    val settings: Settings,
) {

    private val qrFeature: QrFeature by lazy {
        QrFeature(
            context = activity,
            fragmentManager = activity.supportFragmentManager,
            onScanResult = { result ->
                appStore.dispatch(AppAction.QrScannerAction.QrScannerInputAvailable(result))
            },
            onNeedToRequestPermissions = { permissions ->
                // get permissions
                ActivityCompat.requestPermissions(activity, permissions, REQUEST_CODE_CAMERA_PERMISSIONS)
            },
        )
    }

    /**
     * Launches the QR Scanner.
     */
    fun launchQrScanner() {
        Events.browserToolbarQrScanTapped.record(NoExtras())

        activity.getRootView()?.hideKeyboard()

        when {
            activity.isPermissionGranted(Manifest.permission.CAMERA) -> qrFeature.scan()

            else -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.CAMERA),
                        REQUEST_CODE_CAMERA_PERMISSIONS,
                    )
                } else {
                    buildPermissionDialog().show()
                }
            }
        }
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
    internal fun buildPermissionDialog(): AlertDialog.Builder {
        return AlertDialog.Builder(activity).apply {
            val spannableText = SpannableString(
                activity.resources.getString(R.string.camera_permissions_needed_message),
            )
            setMessage(spannableText)
            setNegativeButton(R.string.camera_permissions_needed_negative_button_text) { _, _ ->
                appStore.dispatch(AppAction.QrScannerAction.QrScannerDismissed)
            }
            setPositiveButton(R.string.camera_permissions_needed_positive_button_text) { dialog: DialogInterface, _ ->
                val intent: Intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                } else {
                    SupportUtils.createCustomTabIntent(
                        activity,
                        SupportUtils.getSumoURLForTopic(
                            activity,
                            SupportUtils.SumoTopic.QR_CAMERA_ACCESS,
                            ),
                        )
                }
                val uri = Uri.fromParts("package", activity.packageName, null)
                intent.data = uri
                dialog.cancel()
                activity.startActivity(intent)
            }
            setOnDismissListener {
                appStore.dispatch(AppAction.QrScannerAction.QrScannerDismissed)
                browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = true))
            }
            create().withCenterAlignedButtons()
        }
    }

    /**
     * Holds constant values.
     */
    companion object {
        private const val REQUEST_CODE_CAMERA_PERMISSIONS = 1
    }
}
