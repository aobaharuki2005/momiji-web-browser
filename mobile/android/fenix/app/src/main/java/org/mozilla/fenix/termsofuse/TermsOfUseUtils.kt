/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse

import org.mozilla.fenix.Config
import org.mozilla.fenix.utils.Settings

/**
 * Determines whether the Terms of Service bottom sheet should be shown.
 *
 * This function returns `true` if:
 * - The user has not accepted the Terms of Service,
 * - The user has not postponed accepting the Terms of Service, and
 * - The current build channel is a debug build.
 *
 * @receiver the [Settings] instance containing user preference flags.
 * @return `true` if the Terms of Service bottom sheet should be shown; otherwise, `false`.
 */
fun Settings.shouldShowTermsOfUsePrompt(): Boolean =
    !hasAcceptedTermsOfService &&
            !hasPostponedAcceptingTermsOfService &&
            Config.channel.isDebug
