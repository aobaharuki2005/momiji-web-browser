/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.downloads

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.content.DownloadState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.SupportedMenuNotifications

/**
 * Observes the download status from the [BrowserStore] and updates the [AppStore]
 * to show a notification in the main menu when a download has completed.
 *
 * @param browserStore The [BrowserStore] that holds the browser state, including download information.
 * @param appStore The [AppStore] to dispatch actions to, for updating UI components like menu notifications.
 */
class DownloadStatusBinding(
    browserStore: BrowserStore,
    private val appStore: AppStore,
) : AbstractBinding<BrowserState>(browserStore) {

    override suspend fun onState(flow: Flow<BrowserState>) {
        flow
            .map { it.downloads }
            .distinctUntilChanged()
            .collect { downloads ->
                val hasCompletedDownload = downloads.values.any { downloadState ->
                    downloadState.status == DownloadState.Status.COMPLETED
                }
                if (hasCompletedDownload) {
                    appStore.dispatch(
                        AppAction.MenuNotification.AddMenuNotification(
                            SupportedMenuNotifications.Downloads,
                        ),
                    )
                }
            }
    }
}
