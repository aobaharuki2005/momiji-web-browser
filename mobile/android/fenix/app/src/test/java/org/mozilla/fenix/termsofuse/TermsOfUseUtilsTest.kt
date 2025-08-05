/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import io.mockk.every
import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TermsOfUseUtilsTest {

    private lateinit var settings: Settings

    @Before
    fun setup() {
        settings = Settings(testContext)
        every { testContext.settings() } returns settings
    }

    @Test
    fun `GIVEN the user has not accepted terms of use AND has not postponed accepting THEN the prompt should show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfService = false

        assertTrue(settings.shouldShowTermsOfUsePrompt())
    }

    @Test
    fun `GIVEN the user has accepted terms of use AND has not postponed accepting THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = true
        settings.hasPostponedAcceptingTermsOfService = false

        assertFalse(settings.shouldShowTermsOfUsePrompt())
    }

    @Test
    fun `GIVEN the user has not accepted terms of use AND has postponed accepting THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = false
        settings.hasPostponedAcceptingTermsOfService = true

        assertFalse(settings.shouldShowTermsOfUsePrompt())
    }

    @Test
    fun `GIVEN the user has accepted terms of use AND has postponed accepting THEN the prompt should not show`() {
        settings.hasAcceptedTermsOfService = true
        settings.hasPostponedAcceptingTermsOfService = true

        assertFalse(settings.shouldShowTermsOfUsePrompt())
    }
}
