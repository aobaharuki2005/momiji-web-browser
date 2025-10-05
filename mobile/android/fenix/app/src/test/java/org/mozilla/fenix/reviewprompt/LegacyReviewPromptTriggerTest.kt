/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.reviewprompt

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyReviewPromptTriggerTest {

    private var numberOfAppLaunches = 5
    private var isDefaultBrowser = true

    @Test
    fun `WHEN app is the default browser AND was launched at least 5 times THEN legacy trigger is satisfied`() {
        assertTrue(legacyReviewPromptTrigger({ numberOfAppLaunches }, { isDefaultBrowser }))
    }

    @Test
    fun `WHEN app isn't the default browser THEN legacy trigger is not satisfied`() {
        isDefaultBrowser = false

        assertFalse(legacyReviewPromptTrigger({ numberOfAppLaunches }, { isDefaultBrowser }))
    }

    @Test
    fun `WHEN app was launched less than 5 times THEN legacy trigger is not satisfied`() {
        numberOfAppLaunches = 4

        assertFalse(legacyReviewPromptTrigger({ numberOfAppLaunches }, { isDefaultBrowser }))
    }
}
