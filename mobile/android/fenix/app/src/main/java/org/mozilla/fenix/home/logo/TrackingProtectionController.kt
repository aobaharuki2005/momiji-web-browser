/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.logo

import androidx.navigation.NavController
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Homepage
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.nav
import org.mozilla.fenix.home.HomeFragmentDirections

/**
 * Home content controller for handling interactions with the tracking protections pill.
 */
class TrackingProtectionController(
    private val navController: NavController,
) {
    /**
     * Handle the tracking protections pill being clicked.
     */
    fun handleProtectionStatusPillClicked() {
        Homepage.privacyReportTapped.record(NoExtras())

        navController.nav(
            R.id.homeFragment,
            HomeFragmentDirections.actionHomeFragmentToGlobalProtectionsDashboard(),
        )
    }
}
