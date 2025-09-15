/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.action.DownloadAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.content.DownloadState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.mock
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.rule.runTestOnMain
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.verify
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications

@RunWith(AndroidJUnit4::class)
class DownloadStatusBindingTest {
    @get:Rule
    val coroutineRule = MainCoroutineRule()
    private lateinit var appStore: AppStore

    @Before
    fun setUp() {
        appStore = mock()
    }

    @Test
    fun `WHEN download is completed THEN add downloads menu notification`() = runTestOnMain {
        val currentTabId = "test"
        val currentTab = TabSessionState(
            id = currentTabId,
            content = ContentState(
                url = "https://mozilla.org",
            ),
        )

        val browserStore = BrowserStore(
            initialState = BrowserState(tabs = listOf(mock(), currentTab)),
        )

        val binding = DownloadStatusBinding(
            browserStore = browserStore,
            appStore = appStore,
        )

        val download =
            DownloadState("https://mozilla.org/download", status = DownloadState.Status.COMPLETED)

        binding.start()

        browserStore.dispatch(
            DownloadAction.UpdateDownloadAction(download),
        )

        browserStore.waitUntilIdle()

        verify(appStore).dispatch(
            AppAction.MenuNotification.AddMenuNotification(
                SupportedMenuNotifications.Downloads,
            ),
        )
    }
}
