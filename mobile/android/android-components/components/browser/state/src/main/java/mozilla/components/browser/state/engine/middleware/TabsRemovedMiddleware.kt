/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.state.engine.middleware

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.CustomTabListAction
import mozilla.components.browser.state.action.EngineAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.selector.findCustomTab
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.selector.normalTabs
import mozilla.components.browser.state.selector.privateTabs
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.SessionState
import mozilla.components.concept.engine.EngineSession
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] responsible for closing and unlinking [EngineSession] instances whenever tabs get
 * removed.
 */
internal class TabsRemovedMiddleware(
    private val scope: CoroutineScope,
) : Middleware<BrowserState, BrowserAction> {
    override fun invoke(
        context: MiddlewareContext<BrowserState, BrowserAction>,
        next: (BrowserAction) -> Unit,
        action: BrowserAction,
    ) {
        when (action) {
            is TabListAction.RemoveAllNormalTabsAction -> onTabsRemoved(context, context.store.state.normalTabs)
            is TabListAction.RemoveAllPrivateTabsAction -> onTabsRemoved(context, context.store.state.privateTabs)
            is TabListAction.RemoveAllTabsAction -> onTabsRemoved(context, context.store.state.tabs)
            is TabListAction.RemoveTabAction -> context.store.state.findTab(action.tabId)?.let {
                onTabsRemoved(context, listOf(it))
            }
            is TabListAction.RemoveTabsAction -> action.tabIds.mapNotNull { context.store.state.findTab(it) }.let {
                onTabsRemoved(context, it)
            }
            is CustomTabListAction.RemoveAllCustomTabsAction -> onTabsRemoved(context, context.store.state.customTabs)
            is CustomTabListAction.RemoveCustomTabAction -> context.store.state.findCustomTab(action.tabId)?.let {
                onTabsRemoved(context, listOf(it))
            }
            else -> {
                // no-op
            }
        }

        next(action)
    }

    private fun onTabsRemoved(
        context: MiddlewareContext<BrowserState, BrowserAction>,
        tabs: List<SessionState>,
    ) {
        tabs.forEach { tab ->
            if (tab.engineState.engineSession != null) {
                context.store.dispatch(
                    EngineAction.UnlinkEngineSessionAction(
                        tab.id,
                    ),
                )
                scope.launch {
                    tab.engineState.engineSession?.close()
                }
            }
        }
    }
}
