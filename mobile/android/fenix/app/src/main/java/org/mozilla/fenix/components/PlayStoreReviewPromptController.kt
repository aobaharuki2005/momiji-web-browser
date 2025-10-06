/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.annotation.VisibleForTesting
import androidx.core.net.toUri
import com.google.android.play.core.review.ReviewException
import com.google.android.play.core.review.ReviewInfo
import com.google.android.play.core.review.ReviewManager
import com.google.android.play.core.review.model.ReviewErrorCode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.fenix.BrowserDirection
import org.mozilla.fenix.GleanMetrics.ReviewPrompt
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.components.ReviewPromptDisplayState.Displayed
import org.mozilla.fenix.components.ReviewPromptDisplayState.NotDisplayed
import org.mozilla.fenix.components.ReviewPromptDisplayState.Unknown
import org.mozilla.fenix.settings.SupportUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

val logger = Logger("PlayStoreReviewPromptController")

/**
 * Wraps the Play Store In-App Review API.
 */
class PlayStoreReviewPromptController(
    private val manager: ReviewManager,
    private val numberOfAppLaunches: () -> Int,
) {

    /**
     * Launch the in-app review flow, unless we've hit the quota.
     */
    suspend fun tryPromptReview(activity: Activity) {
        logger.info("tryPromptReview in progress...")
        val request = withContext(Dispatchers.IO) { manager.requestReviewFlow() }

        request.addOnCompleteListener { task ->
            val promptWasDisplayed: Boolean

            if (task.isSuccessful) {
                logger.info("Launching in-app review flow.")
                manager.launchReviewFlow(activity, task.result)
                promptWasDisplayed = task.result.promptDisplayState == Displayed
                if (!promptWasDisplayed) {
                    logger.warn("Looks like in-app review flow wasn't displayed, even though there was no error.")
                }
            } else {
                promptWasDisplayed = false

                @ReviewErrorCode val reviewErrorCode = (task.exception as ReviewException).errorCode
                logger.warn("Failed to launch in-app review flow due to: $reviewErrorCode.")
            }

            if (!promptWasDisplayed) {
                tryLaunchPlayStoreReview(activity)
            }

            recordReviewPromptEvent(
                promptDisplayState = task.result.promptDisplayState,
                numberOfAppLaunches = numberOfAppLaunches(),
                now = Date(),
            )
        }

        logger.info("tryPromptReview completed.")
    }

    /**
     * Try to launch the play store review flow.
     */
    fun tryLaunchPlayStoreReview(activity: Activity) {
        logger.info("tryLaunchPlayStoreReview in progress...")

        try {
            logger.info("Navigating to Play store listing.")
            activity.startActivity(
                Intent(Intent.ACTION_VIEW, SupportUtils.RATE_APP_URL.toUri()),
            )
        } catch (e: ActivityNotFoundException) {
            // Device without the play store installed.
            // Opening the play store website.
            (activity as HomeActivity).openToBrowserAndLoad(
                searchTermOrURL = SupportUtils.FENIX_PLAY_STORE_URL,
                newTab = true,
                from = BrowserDirection.FromSettings,
            )
            logger.warn("Failed to launch play store review flow due to: $e.")
        }

        logger.info("tryLaunchPlayStoreReview completed.")
    }
}

private val ReviewInfo.promptDisplayState: ReviewPromptDisplayState
    get() {
        // The internals of ReviewInfo cannot be accessed directly or cast nicely, so let's simply use
        // the object as a string.
        return ReviewPromptDisplayState.from(reviewInfoAsString = toString())
    }

/**
 * Result of an attempt to determine if Play Store In-App Review Prompt was displayed.
 */
@VisibleForTesting
enum class ReviewPromptDisplayState {
    NotDisplayed, Displayed, Unknown;

    /**
     * @see [ReviewPromptDisplayState]
     */
    companion object {
        /**
         * The docs for [ReviewManager.launchReviewFlow] state 'In some circumstances the review
         * flow will not be shown to the user, e.g. they have already seen it recently, so do not assume that
         * calling this method will always display the review dialog.'
         * However, investigation has shown that a [ReviewInfo] instance with the flag:
         * - 'isNoOp=true' indicates that the prompt has NOT been displayed.
         * - 'isNoOp=false' indicates that a prompt has been displayed.
         * [ReviewManager.launchReviewFlow] will modify the ReviewInfo instance which can be used to determine
         * which of these flags is present.
         */
        fun from(reviewInfoAsString: String): ReviewPromptDisplayState {
            return when {
                reviewInfoAsString.contains("isNoOp=true") -> NotDisplayed
                reviewInfoAsString.contains("isNoOp=false") -> Displayed
                // ReviewInfo is susceptible to changes outside of our control hence the catch-all 'else' statement.
                else -> Unknown
            }
        }
    }
}

/**
 * Records a [ReviewPrompt] with the required data.
 */
@VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
fun recordReviewPromptEvent(
    promptDisplayState: ReviewPromptDisplayState,
    numberOfAppLaunches: Int,
    now: Date,
) {
    val formattedLocalDatetime =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(now)

    val promptWasDisplayed = when (promptDisplayState) {
        NotDisplayed -> "false"
        Displayed -> "true"
        Unknown -> "error"
    }

    ReviewPrompt.promptAttempt.record(
        ReviewPrompt.PromptAttemptExtra(
            promptWasDisplayed = promptWasDisplayed,
            localDatetime = formattedLocalDatetime,
            numberOfAppLaunches = numberOfAppLaunches,
        ),
    )
}
