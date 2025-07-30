/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class LegacyReviewPromptTriggerTest {

    private val settings = Settings(testContext).apply {
        numberOfAppLaunches = 5
        isDefaultBrowser = true
        lastReviewPromptTimeInMillis = 0L
    }

    @Test
    fun `WHEN app is the default browser AND was launched at least 5 times THEN legacy trigger is satisfied`() {
        assertTrue(legacyReviewPromptTrigger(settings))
    }

    @Test
    fun `WHEN app isn't the default browser THEN legacy trigger is not satisfied`() {
        settings.isDefaultBrowser = false

        assertFalse(legacyReviewPromptTrigger(settings))
    }

    @Test
    fun `WHEN app was launched less than 5 times THEN legacy trigger is not satisfied`() {
        settings.numberOfAppLaunches = 4

        assertFalse(legacyReviewPromptTrigger(settings))
    }
}
