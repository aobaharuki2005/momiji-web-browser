/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home

import android.content.Context
import android.view.LayoutInflater
import androidx.lifecycle.LifecycleCoroutineScope
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.spyk
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import mozilla.components.feature.top.sites.TopSite
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.components.toolbar.ToolbarPosition
import org.mozilla.fenix.databinding.FragmentHomeBinding
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.home.HomeFragment.Companion.TOAST_ELEVATION
import org.mozilla.fenix.home.toolbar.HomeToolbarView
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.utils.allowUndo
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class InstrumentedHomeFragmentTest {
    val homeFragment = spyk(HomeFragment())

    @Test
    fun `WHEN configuration changed THEN menu is dismissed`() {
        val context: Context = mockk(relaxed = true)
        every { homeFragment.context } answers { context }
        every { context.components.settings } answers { mockk(relaxed = true) }
        val homeMenuView: HomeMenuView = mockk(relaxed = true)
        val homeBinding = FragmentHomeBinding.inflate(LayoutInflater.from(testContext))
        val toolbarView = HomeToolbarView(homeBinding, mockk(), homeFragment, mockk())
        toolbarView.homeMenuView = homeMenuView
        homeFragment.nullableToolbarView = toolbarView

        homeFragment.onConfigurationChanged(mockk(relaxed = true))

        verify(exactly = 1) { homeMenuView.dismissMenu() }
    }
}
