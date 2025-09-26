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
import org.mozilla.fenix.components.ReviewPromptDisplayState.Displayed
import org.mozilla.fenix.components.ReviewPromptDisplayState.NotDisplayed
import org.mozilla.fenix.components.ReviewPromptDisplayState.Unknown
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

    private val reviewManager = FakeReviewManager(testContext)
    private val controller = PlayStoreReviewPromptController(
        manager = reviewManager,
        numberOfAppLaunches = { 5 },
    )

    @Test
    fun `GIVEN activity is resumed WHEN tryPromptReview is called THEN launches review flow`() =
        runTest {
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
            val scenario = launchActivity<ComponentActivity>()
            scenario.moveToState(Lifecycle.State.RESUMED)
            scenario.moveToState(Lifecycle.State.CREATED)

            scenario.onActivity { activity ->
                launch {
                    controller.tryPromptReview(activity)

                    assertFalse(reviewManager.promptHasBeenRequested)
                }
            }
        }

    @Test
    fun `WHEN review info contains 'isNoOp=false' THEN prompt was displayed`() {
        val displayState = ReviewPromptDisplayState.from(createReviewInfoString("isNoOp=false"))

        assertEquals(Displayed, displayState)
    }

    @Test
    fun `WHEN review info contains 'isNoOp=true' THEN prompt wasn't displayed`() {
        val displayState = ReviewPromptDisplayState.from(createReviewInfoString("isNoOp=true"))

        assertEquals(NotDisplayed, displayState)
    }

    @Test
    fun `WHEN review info doesn't contain 'isNoOp' THEN prompt display state is unknown`() {
        val displayState = ReviewPromptDisplayState.from(createReviewInfoString())

        assertEquals(Unknown, displayState)
    }

    private fun createReviewInfoString(optionalArg: String? = ""): String {
        return "ReviewInfo{pendingIntent=PendingIntent{5b613b1: android.os.BinderProxy@46c8096}, $optionalArg}"
    }

    @Test
    fun reviewPromptWasDisplayed() {
        testRecordReviewPromptEventRecordsTheExpectedData(Displayed, "true")
    }

    @Test
    fun reviewPromptWasNotDisplayed() {
        testRecordReviewPromptEventRecordsTheExpectedData(NotDisplayed, "false")
    }

    @Test
    fun reviewPromptDisplayStateUnknown() {
        testRecordReviewPromptEventRecordsTheExpectedData(Unknown, "error")
    }

    private fun testRecordReviewPromptEventRecordsTheExpectedData(
        promptDisplayState: ReviewPromptDisplayState,
        promptWasDisplayed: String,
    ) {
        val numberOfAppLaunches = 1
        val datetime = Date(TEST_TIME_NOW)
        val formattedNowLocalDatetime = SIMPLE_DATE_FORMAT.format(datetime)

        assertNull(ReviewPrompt.promptAttempt.testGetValue())
        recordReviewPromptEvent(promptDisplayState, numberOfAppLaunches, datetime)

        val reviewPromptData = ReviewPrompt.promptAttempt.testGetValue()!!.last().extra!!
        assertEquals(promptWasDisplayed, reviewPromptData["prompt_was_displayed"])
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

private class FakeReviewManager(context: Context) : ReviewManager {
    var promptHasBeenRequested = false

    private val wrapped = com.google.android.play.core.review.testing.FakeReviewManager(context)

    override fun requestReviewFlow(): FakeGmsTask<ReviewInfo> {
        val requestReviewFlow = wrapped.requestReviewFlow()
        val result = requestReviewFlow.result
        return FakeGmsTask(result)
    }

    override fun launchReviewFlow(activity: Activity, reviewInfo: ReviewInfo): FakeGmsTask<Void?> {
        promptHasBeenRequested = true
        return FakeGmsTask(null)
    }
}

private class FakeGmsTask<T>(private val result: T) : Task<T>() {
    override fun addOnCompleteListener(activity: Activity, listener: OnCompleteListener<T>): Task<T> {
        val isNotStopped = (activity as ComponentActivity).lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
        if (isNotStopped) {
            listener.onComplete(this)
        }
        return this
    }

    override fun isSuccessful() = true

    override fun getResult() = result

    override fun <X : Throwable?> getResult(exceptionType: Class<X>) = result

    override fun isComplete() = assertUnused()
    override fun isCanceled() = assertUnused()
    override fun getException() = assertUnused()
    override fun addOnSuccessListener(listener: OnSuccessListener<in T>) = assertUnused()
    override fun addOnSuccessListener(executor: Executor, listener: OnSuccessListener<in T>) = assertUnused()
    override fun addOnSuccessListener(activity: Activity, listener: OnSuccessListener<in T>) = assertUnused()
    override fun addOnFailureListener(listener: OnFailureListener) = assertUnused()
    override fun addOnFailureListener(executor: Executor, listener: OnFailureListener) = assertUnused()
    override fun addOnFailureListener(activity: Activity, listener: OnFailureListener) = assertUnused()
    override fun addOnCompleteListener(listener: OnCompleteListener<T>) = assertUnused()
}
