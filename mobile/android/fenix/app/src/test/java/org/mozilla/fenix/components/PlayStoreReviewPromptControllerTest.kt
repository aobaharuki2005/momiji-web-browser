/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.app.Activity
import android.content.Context
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.launchActivity
import com.google.android.gms.tasks.OnCompleteListener
import com.google.android.gms.tasks.OnFailureListener
import com.google.android.gms.tasks.OnSuccessListener
import com.google.android.gms.tasks.Task
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import mozilla.components.support.test.assertUnused
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.ReviewPrompt
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.robolectric.RobolectricTestRunner
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor

@RunWith(RobolectricTestRunner::class)
class PlayStoreReviewPromptControllerTest {

    @get:Rule
    val gleanTestRule = FenixGleanTestRule(testContext)

    @Test
    fun `GIVEN activity is resumed WHEN tryPromptReview is called THEN launches review flow`() =
        runTest {
            val reviewManager = SuccessfulReviewManager(testContext)
            val controller = PlayStoreReviewPromptController(
                manager = reviewManager,
                numberOfAppLaunches = { 5 },
            )
            val scenario = launchActivity<ComponentActivity>()
            scenario.moveToState(Lifecycle.State.RESUMED)

            scenario.onActivity { activity ->
                launch {
                    controller.tryPromptReview(activity)

                    assertTrue(reviewManager.promptHasBeenRequested)
                }
            }
        }

    @Test
    fun `GIVEN activity is stopped WHEN tryPromptReview is called THEN doesn't run the on complete callback`() =
        runTest {
            val reviewManager = SuccessfulReviewManager(testContext)
            val controller = PlayStoreReviewPromptController(
                manager = reviewManager,
                numberOfAppLaunches = { 5 },
            )
            val scenario = launchActivity<ComponentActivity>()
            scenario.moveToState(Lifecycle.State.RESUMED)
            scenario.moveToState(Lifecycle.State.CREATED) // Move back from resumed to created, in effect stopping it.

            scenario.onActivity { activity ->
                launch {
                    controller.tryPromptReview(activity)

                    assertFalse(reviewManager.promptHasBeenRequested)
                }
            }
        }

    @Test
    fun `WHEN the reviews API fails THEN runs the error callback`() = runTest {
        val controller = PlayStoreReviewPromptController(
            manager = FailingReviewManager(),
            numberOfAppLaunches = { 5 },
        )
        val scenario = launchActivity<ComponentActivity>()
        scenario.moveToState(Lifecycle.State.RESUMED)
        var onErrorRan = false

        scenario.onActivity { activity ->
            launch {
                controller.tryPromptReview(
                    activity = activity,
                    onError = { onErrorRan = true },
                )

                assertTrue(onErrorRan)
            }
        }
    }

    @Test
    fun reviewPromptWasDisplayed() {
        testRecordReviewPromptEventRecordsTheExpectedData("isNoOp=false", "true")
    }

    @Test
    fun reviewPromptWasNotDisplayed() {
        testRecordReviewPromptEventRecordsTheExpectedData("isNoOp=true", "false")
    }

    @Test
    fun reviewPromptDisplayStateUnknown() {
        testRecordReviewPromptEventRecordsTheExpectedData(expected = "error")
    }

    private fun testRecordReviewPromptEventRecordsTheExpectedData(
        reviewInfoArg: String = "",
        expected: String,
    ) {
        val numberOfAppLaunches = 1
        val reviewInfoAsString =
            "ReviewInfo{pendingIntent=PendingIntent{5b613b1: android.os.BinderProxy@46c8096}, $reviewInfoArg}"
        val datetime = Date(TEST_TIME_NOW)
        val formattedNowLocalDatetime = SIMPLE_DATE_FORMAT.format(datetime)

        assertNull(ReviewPrompt.promptAttempt.testGetValue())
        recordReviewPromptEvent(reviewInfoAsString, numberOfAppLaunches, datetime)

        val reviewPromptData = ReviewPrompt.promptAttempt.testGetValue()!!.last().extra!!
        assertEquals(expected, reviewPromptData["prompt_was_displayed"])
        assertEquals(numberOfAppLaunches, reviewPromptData["number_of_app_launches"]!!.toInt())
        assertEquals(formattedNowLocalDatetime, reviewPromptData["local_datetime"])
    }

    companion object {
        private const val TEST_TIME_NOW = 1598416882805L
        private val SIMPLE_DATE_FORMAT by lazy {
            SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss",
                Locale.getDefault(),
            )
        }
    }
}

private class SuccessfulReviewManager(context: Context) : ReviewManager {
    var promptHasBeenRequested = false

    private val wrapped = com.google.android.play.core.review.testing.FakeReviewManager(context)

    override fun requestReviewFlow(): Task<ReviewInfo> {
        val requestReviewFlow = wrapped.requestReviewFlow()
        return SuccessfulTask(requestReviewFlow.result)
    }

    override fun launchReviewFlow(activity: Activity, reviewInfo: ReviewInfo): Task<Void?> {
        promptHasBeenRequested = true
        return VoidTask()
    }
}

private class FailingReviewManager : ReviewManager {
    override fun requestReviewFlow() = FailingTask<ReviewInfo>()
    override fun launchReviewFlow(activity: Activity, reviewInfo: ReviewInfo) = assertUnused()
}

private class SuccessfulTask<T>(private val result: T) : FakeGmsTask<T>() {
    override fun isSuccessful() = true
    override fun getResult() = result
    override fun <X : Throwable?> getResult(exceptionType: Class<X>) = result
}

private class FailingTask<T> : FakeGmsTask<T>() {
    override fun isSuccessful() = false
    override fun getException() = RuntimeException("Unexpected exception.")
}

private class VoidTask : FakeGmsTask<Void?>()

private open class FakeGmsTask<T> : Task<T>() {
    override fun addOnCompleteListener(activity: Activity, listener: OnCompleteListener<T>): Task<T> {
        val isNotStopped = (activity as ComponentActivity).lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        if (isNotStopped) {
            listener.onComplete(this)
        }
        return this
    }

    override fun isSuccessful(): Boolean = assertUnused()
    override fun isComplete(): Boolean = assertUnused()
    override fun isCanceled(): Boolean = assertUnused()
    override fun getResult(): T? = assertUnused()
    override fun <X : Throwable?> getResult(exceptionType: Class<X>): T? = assertUnused()
    override fun getException(): Exception? = assertUnused()
    override fun addOnSuccessListener(listener: OnSuccessListener<in T>): Task<T> = assertUnused()
    override fun addOnSuccessListener(executor: Executor, listener: OnSuccessListener<in T>): Task<T> = assertUnused()
    override fun addOnSuccessListener(activity: Activity, listener: OnSuccessListener<in T>): Task<T> = assertUnused()
    override fun addOnFailureListener(listener: OnFailureListener): Task<T> = assertUnused()
    override fun addOnFailureListener(executor: Executor, listener: OnFailureListener): Task<T> = assertUnused()
    override fun addOnFailureListener(activity: Activity, listener: OnFailureListener): Task<T> = assertUnused()
    override fun addOnCompleteListener(listener: OnCompleteListener<T>): Task<T> = assertUnused()
}
