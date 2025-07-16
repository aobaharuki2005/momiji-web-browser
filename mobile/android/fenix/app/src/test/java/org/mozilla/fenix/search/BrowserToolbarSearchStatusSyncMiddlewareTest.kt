/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search

import androidx.lifecycle.Lifecycle
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.setMain
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToggleEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.support.test.ext.joinBlocking
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.rule.runTestOnMain
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.helpers.lifecycle.TestLifecycleOwner
import org.mozilla.fenix.home.toolbar.HomeToolbarEnvironment
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowserToolbarSearchStatusSyncMiddlewareTest {
    @get:Rule
    val coroutinesTestRule = MainCoroutineRule()

    private val appStore = AppStore()

    @Test
    fun `GIVEN an environment was already set WHEN it is cleared THEN reset it to null`() {
        val (middleware, toolbarStore) = buildMiddlewareAndAddToSearchStore()

        assertNotNull(middleware.environment)

        toolbarStore.dispatch(EnvironmentCleared)

        assertNull(middleware.environment)
    }

    @Test
    fun `WHEN the toolbar exits search mode THEN synchronize search being ended for the application`() {
        val (_, toolbarStore) = buildMiddlewareAndAddToSearchStore()
        assertFalse(toolbarStore.state.isEditMode())
        assertFalse(appStore.state.searchState.isSearchActive)

        appStore.dispatch(SearchStarted())
        toolbarStore.dispatch(ToggleEditMode(true))
        assertTrue(appStore.state.searchState.isSearchActive)

        toolbarStore.dispatch(ToggleEditMode(false))
        assertFalse(appStore.state.searchState.isSearchActive)
    }

    @Test
    fun `WHEN search is closed in the application THEN synchronize exiting edit mode in the toolbar`() = runTestOnMain {
        Dispatchers.setMain(StandardTestDispatcher())

        val (_, toolbarStore) = buildMiddlewareAndAddToSearchStore()
        appStore.dispatch(SearchStarted())
        toolbarStore.dispatch(ToggleEditMode(true))
        testScheduler.advanceUntilIdle()
        toolbarStore.waitUntilIdle()
        assertTrue(toolbarStore.state.isEditMode())
        assertTrue(appStore.state.searchState.isSearchActive)

        appStore.dispatch(SearchEnded).joinBlocking()
        testScheduler.advanceUntilIdle()
        assertFalse(appStore.state.searchState.isSearchActive)
        assertFalse(toolbarStore.state.isEditMode())

        appStore.dispatch(SearchStarted()).joinBlocking()
        testScheduler.advanceUntilIdle()
        assertTrue(appStore.state.searchState.isSearchActive)
        assertFalse(toolbarStore.state.isEditMode())
    }

    private fun buildMiddlewareAndAddToSearchStore(
        appStore: AppStore = this.appStore,
    ): Pair<BrowserToolbarSearchStatusSyncMiddleware, BrowserToolbarStore> {
        val middleware = buildMiddleware(appStore)
        val toolbarStore = BrowserToolbarStore(
            middleware = listOf(middleware),
        ).also {
            it.dispatch(
                EnvironmentRehydrated(
                    HomeToolbarEnvironment(
                        context = testContext,
                        navController = mockk(),
                        viewLifecycleOwner = TestLifecycleOwner(Lifecycle.State.RESUMED),
                        browsingModeManager = mockk(),
                    ),
                ),
            )
        }
        return middleware to toolbarStore
    }

    private fun buildMiddleware(
        appStore: AppStore = this.appStore,
    ) = BrowserToolbarSearchStatusSyncMiddleware(appStore)
}
