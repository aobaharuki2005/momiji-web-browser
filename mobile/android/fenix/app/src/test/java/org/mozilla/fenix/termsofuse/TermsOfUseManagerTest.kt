/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import org.junit.Test
import org.mozilla.fenix.utils.Settings.Companion.FIVE_DAYS_MS

class TermsOfUseManagerTest {
    @Test
    fun `WHEN all conditions satisfied AND we ignore the first check THEN shouldShowTermsOfUsePrompt returns true`() {
        val repository = MockTermsOfUsePromptRepository()

        val termsOfUseManager = TermsOfUseManager(repository)

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN user has already accepted the Terms of Use THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository(hasAcceptedTermsOfUse = true)

        val termsOfUseManager = TermsOfUseManager(repository)

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN the Terms of Use feature flag is disabled THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository(isTermsOfUsePromptEnabled = false)

        val termsOfUseManager = TermsOfUseManager(repository)

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN prompt display count exceeded the max number of times to display THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository(hasExceededMaxDisplayCount = true)

        val termsOfUseManager = TermsOfUseManager(repository)

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN the user has postponed accepting and it has been 5 days since THEN shouldShowTermsOfUsePrompt returns true`() {
        val repository = MockTermsOfUsePromptRepository(
            hasPostponedAcceptingTermsOfUse = true,
            lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis() - FIVE_DAYS_MS,
        )

        val termsOfUseManager = TermsOfUseManager(repository)

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN the user has postponed accepting and it has not been 5 days since THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository(
            hasPostponedAcceptingTermsOfUse = true,
            lastTermsOfUsePromptTimeInMillis = System.currentTimeMillis(),
        )

        val termsOfUseManager = TermsOfUseManager(repository)

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN this is not first check of the session and don't ignore first check THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository()

        val termsOfUseManager = TermsOfUseManager(repository)

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt())
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN this is first check of the session and don't ignore first check THEN shouldShowTermsOfUsePrompt returns true`() {
        val repository = MockTermsOfUsePromptRepository()

        val termsOfUseManager = TermsOfUseManager(repository)
        termsOfUseManager.onStart()

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePrompt())
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN this is not the first check of the session and we ignore the first check THEN shouldShowTermsOfUsePrompt returns true`() {
        val repository = MockTermsOfUsePromptRepository()

        val termsOfUseManager = TermsOfUseManager(repository)
        termsOfUseManager.shouldShowTermsOfUsePrompt()

        assertTrue(termsOfUseManager.shouldShowTermsOfUsePrompt(ignoreFirstCheckSinceStartingApp = true))
    }

    @Test
    fun `GIVEN other conditions satisfied WHEN this is not the first check of the session and we don't ignore the first check THEN shouldShowTermsOfUsePrompt returns false`() {
        val repository = MockTermsOfUsePromptRepository()

        val termsOfUseManager = TermsOfUseManager(repository)
        termsOfUseManager.shouldShowTermsOfUsePrompt()

        assertFalse(termsOfUseManager.shouldShowTermsOfUsePrompt())
    }
}
