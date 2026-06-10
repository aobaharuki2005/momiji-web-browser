/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.logo

import androidx.navigation.NavController
import androidx.navigation.NavDestination
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.verify
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.GleanMetrics.Homepage
import org.mozilla.fenix.R
import org.mozilla.fenix.helpers.FenixGleanTestRule
import org.mozilla.fenix.home.HomeFragmentDirections

@RunWith(AndroidJUnit4::class)
class TrackingProtectionControllerTest {
    @get:Rule
    val gleanRule = FenixGleanTestRule(testContext)

    @Test
    fun `WHEN the protection status pill is clicked THEN navigate to the protections dashboard`() {
        val navController: NavController = mockk {
            every { currentDestination } returns mockk<NavDestination> {
                every { id } returns R.id.homeFragment
            }
            every { navigate(any<NavDirections>(), anyNullable<NavOptions>()) } just Runs
        }
        val controller = TrackingProtectionController(navController)

        controller.handleProtectionStatusPillClicked()

        verify { navController.currentDestination }
        verify { navController.navigate(HomeFragmentDirections.actionHomeFragmentToGlobalProtectionsDashboard(), null) }
    }

    @Test
    fun `WHEN the protection status pill is clicked THEN record telemetry`() {
        val navController: NavController = mockk(relaxed = true)
        val controller = TrackingProtectionController(navController)

        controller.handleProtectionStatusPillClicked()

        assertNotNull(Homepage.privacyReportTapped.testGetValue())
    }
}
