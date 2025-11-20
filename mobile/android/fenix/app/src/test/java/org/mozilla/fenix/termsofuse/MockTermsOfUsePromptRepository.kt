/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptRepository

class MockTermsOfUsePromptRepository(
    override var hasAcceptedTermsOfUse: Boolean = false,
    override val isTermsOfUsePromptEnabled: Boolean = true, // enable the feature by default for testing
    override val hasExceededMaxDisplayCount: Boolean = false,
    override val isDebugTermsOfUseTriggerTimeEnabled: Boolean = false,
    override val lastTermsOfUsePromptTimeInMillis: Long = 0L,
    override val hasPostponedAcceptingTermsOfUse: Boolean = false,
) : TermsOfUsePromptRepository {
    override fun updateHasAcceptedTermsOfUsePreference(nowMillis: Long) {}
    override fun updateHasPostponedAcceptingTermsOfUsePreference() {}
    override fun updateLastTermsOfUsePromptTimeInMillis(currentTimeInMillis: Long) {}
    override fun incrementTermsOfUsePromptDisplayedCount() {}
}
