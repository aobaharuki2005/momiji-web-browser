/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import junit.framework.TestCase.assertFalse
import junit.framework.TestCase.assertTrue
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.utils.Settings
import org.robolectric.RobolectricTestRunner

private const val TIME_IN_MILLIS = 1759926358L

/**
 * This copies the default set in `nimbus.fml.yaml` `terms-of-use-prompt` `max-display-count`.
 */
private const val MAX_DISPLAY_COUNT = 2

@RunWith(RobolectricTestRunner::class)
class TermsOfUsePromptRepositoryTest {
    private lateinit var settings: Settings

    private lateinit var repository: DefaultTermsOfUsePromptRepository

    @Before
    fun setup() {
        settings = Settings(testContext)
        repository = DefaultTermsOfUsePromptRepository(settings)
    }

    @Test
    fun `WHEN settings hasAcceptedTermsOfService is false THEN hasAcceptedTermsOfUse returns false`() {
        settings.hasAcceptedTermsOfService = false

        assertFalse(settings.hasAcceptedTermsOfService)
        assertFalse(repository.hasAcceptedTermsOfUse)
    }

    @Test
    fun `WHEN settings hasAcceptedTermsOfService is true THEN hasAcceptedTermsOfUse returns true`() {
        settings.hasAcceptedTermsOfService = true

        assertTrue(settings.hasAcceptedTermsOfService)
        assertTrue(repository.hasAcceptedTermsOfUse)
    }

    @Test
    fun `WHEN settings isTermsOfUsePromptEnabled is false THEN isTermsOfUsePromptEnabled returns false`() {
        settings.isTermsOfUsePromptEnabled = false

        assertFalse(settings.isTermsOfUsePromptEnabled)
        assertFalse(repository.isTermsOfUsePromptEnabled)
    }

    @Test
    fun `WHEN settings isTermsOfUsePromptEnabled is true THEN isTermsOfUsePromptEnabled returns true`() {
        settings.isTermsOfUsePromptEnabled = true

        assertTrue(settings.isTermsOfUsePromptEnabled)
        assertTrue(repository.isTermsOfUsePromptEnabled)
    }

    @Test
    fun `WHEN settings ToU prompt count is more than the max display count THEN hasExceededMaxDisplayCount returns true`() {
        val count = MAX_DISPLAY_COUNT + 1
        settings.termsOfUsePromptDisplayedCount = count

        assertEquals(count, settings.termsOfUsePromptDisplayedCount)
        assertTrue(repository.hasExceededMaxDisplayCount)
    }

    @Test
    fun `WHEN settings ToU prompt count is the max display count THEN hasExceededMaxDisplayCount returns false`() {
        val count = MAX_DISPLAY_COUNT
        settings.termsOfUsePromptDisplayedCount = count

        assertEquals(count, settings.termsOfUsePromptDisplayedCount)
        assertFalse(repository.hasExceededMaxDisplayCount)
    }

    @Test
    fun `WHEN settings ToU prompt count is less than the max display count THEN hasExceededMaxDisplayCount returns false`() {
        val count = MAX_DISPLAY_COUNT - 1
        settings.termsOfUsePromptDisplayedCount = count

        assertEquals(count, settings.termsOfUsePromptDisplayedCount)
        assertFalse(repository.hasExceededMaxDisplayCount)
    }

    @Test
    fun `WHEN settings isDebugTermsOfServiceTriggerTimeEnabled is false THEN isDebugTermsOfUseTriggerTimeEnabled returns false`() {
        settings.isDebugTermsOfServiceTriggerTimeEnabled = false

        assertFalse(settings.isDebugTermsOfServiceTriggerTimeEnabled)
        assertFalse(repository.isDebugTermsOfUseTriggerTimeEnabled)
    }

    @Test
    fun `WHEN settings isDebugTermsOfServiceTriggerTimeEnabled is true THEN isDebugTermsOfUseTriggerTimeEnabled returns true`() {
        settings.isDebugTermsOfServiceTriggerTimeEnabled = true

        assertTrue(settings.isDebugTermsOfServiceTriggerTimeEnabled)
        assertTrue(repository.isDebugTermsOfUseTriggerTimeEnabled)
    }

    @Test
    fun `WHEN settings lastTermsOfUsePromptTimeInMillis is set THEN lastTermsOfUsePromptTimeInMillis returns the same value`() {
        val time = 12345L
        settings.lastTermsOfUsePromptTimeInMillis = time

        assertEquals(time, settings.lastTermsOfUsePromptTimeInMillis)
        assertEquals(time, repository.lastTermsOfUsePromptTimeInMillis)
    }

    @Test
    fun `WHEN settings hasPostponedAcceptingTermsOfUse is false THEN hasPostponedAcceptingTermsOfUse returns false`() {
        settings.hasPostponedAcceptingTermsOfUse = false

        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        assertFalse(repository.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN settings hasPostponedAcceptingTermsOfUse is true THEN hasPostponedAcceptingTermsOfUse returns true`() {
        settings.hasPostponedAcceptingTermsOfUse = true

        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
        assertTrue(repository.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN updateHasAcceptedTermsOfUsePreference is called THEN the related ToU preferences are updated`() {
        assertFalse(settings.hasAcceptedTermsOfService)
        assertEquals(0, settings.termsOfUseAcceptedVersion)
        assertEquals(0L, settings.termsOfUseAcceptedTimeInMillis)

        repository.updateHasAcceptedTermsOfUsePreference(nowMillis = TIME_IN_MILLIS)

        assertTrue(settings.hasAcceptedTermsOfService)
        assertEquals(5, settings.termsOfUseAcceptedVersion)
        assertEquals(TIME_IN_MILLIS, settings.termsOfUseAcceptedTimeInMillis)
    }

    @Test
    fun `WHEN updateHasPostponedAcceptingTermsOfUsePreference is called THEN the preference is updated`() {
        assertFalse(settings.hasPostponedAcceptingTermsOfUse)
        repository.updateHasPostponedAcceptingTermsOfUsePreference()
        assertTrue(settings.hasPostponedAcceptingTermsOfUse)
    }

    @Test
    fun `WHEN updateLastTermsOfUsePromptTimeInMillis is called THEN the preference is updated`() {
        assertEquals(settings.lastTermsOfUsePromptTimeInMillis, 0)
        repository.updateLastTermsOfUsePromptTimeInMillis()
        assertTrue(settings.lastTermsOfUsePromptTimeInMillis > 0)
    }

    @Test
    fun `WHEN incrementTermsOfUsePromptDisplayedCount is called THEN the preference is updated`() {
        assertEquals(0, settings.termsOfUsePromptDisplayedCount)
        repository.incrementTermsOfUsePromptDisplayedCount()
        assertEquals(1, settings.termsOfUsePromptDisplayedCount)
    }
}
