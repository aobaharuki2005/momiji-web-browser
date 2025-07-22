/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.toolbar

import android.content.Context
import android.view.Gravity
import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.updateLayoutParams
import androidx.fragment.app.Fragment
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.navigation.NavController
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.ext.getUrl
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.utils.BackInvokedHandler
import mozilla.components.compose.browser.toolbar.BrowserToolbar
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.components.support.ktx.android.view.ImeInsetsSynchronizer
import org.mozilla.fenix.R
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.components.toolbar.ToolbarPosition.BOTTOM
import org.mozilla.fenix.components.toolbar.ToolbarPosition.TOP
import org.mozilla.fenix.databinding.FragmentHomeBinding
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

/**
 * A wrapper over the [BrowserToolbar] composable to allow for extra customisation and
 * integration in the same framework as the [HomeToolbarView].
 *
 * @param context [Context] used for various system interactions.
 * @param homeBinding [FragmentHomeBinding] which will serve as parent for this composable.
 * @param toolbarStore [BrowserToolbarStore] containing the composable toolbar state.
 * @param appStore [AppStore] to sync from.
 * @param browserStore [BrowserStore] to sync from.
 * @param settings [Settings] for querying various application settings.
 * @param directToSearchConfig [DirectToSearchConfig] configuration for starting with the toolbar in search mode.
 * @param tabStripContent [Composable] as the tab strip content to be displayed together with this toolbar.
 * @param searchSuggestionsContent [Composable] as the search suggestions content to be displayed
 * together with this toolbar.
 * @param navigationBarContent Composable content for the navigation bar.
 */
@Suppress("LongParameterList")
internal class HomeToolbarComposable(
    private val context: Context,
    private val homeBinding: FragmentHomeBinding,
    private val toolbarStore: BrowserToolbarStore,
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val settings: Settings,
    private val directToSearchConfig: DirectToSearchConfig,
    private val tabStripContent: @Composable () -> Unit,
    private val searchSuggestionsContent: @Composable (Modifier) -> Unit,
    private val navigationBarContent: (@Composable () -> Unit)?,
) : FenixHomeToolbar {
    private var showDivider by mutableStateOf(true)

    override val layout = ComposeView(context).apply {
        id = R.id.composable_toolbar

        setContent {
            val isSearching = toolbarStore.observeAsComposableState { it.isEditMode() }.value
            val shouldShowTabStrip: Boolean = remember { settings.isTabStripEnabled }

            BackInvokedHandler(isSearching) {
                appStore.dispatch(SearchEnded)
                browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = true))
            }

            FirefoxTheme {
                Column {
                    if (shouldShowTabStrip) {
                        tabStripContent()
                    }

                    if (settings.shouldUseBottomToolbar) {
                        searchSuggestionsContent(Modifier.weight(1f))
                    }
                    BrowserToolbar(showDivider, settings.shouldUseBottomToolbar)
                    if (settings.toolbarPosition == BOTTOM) {
                        navigationBarContent?.invoke()
                    }
                    if (!settings.shouldUseBottomToolbar) {
                        searchSuggestionsContent(Modifier.weight(1f))
                    }
                }
            }
        }
        translationZ = context.resources.getDimension(R.dimen.browser_fragment_above_toolbar_panels_elevation)
        homeBinding.homeLayout.addView(this)
    }

    override fun build(browserState: BrowserState) {
        layout.updateLayoutParams {
            (this as? CoordinatorLayout.LayoutParams)?.gravity = when (settings.toolbarPosition) {
                TOP -> Gravity.TOP
                BOTTOM -> Gravity.BOTTOM
            }
        }

        if (settings.shouldUseBottomToolbar) {
            ImeInsetsSynchronizer.setup(layout)
        }

        updateHomeAppBarIntegration()
        configureStartingInSearchMode()
    }

    override fun updateDividerVisibility(isVisible: Boolean) {
        showDivider = isVisible
    }

    override fun updateButtonVisibility(
        browserState: BrowserState,
    ) {
        // To be added later
    }

    override fun updateTabCounter(browserState: BrowserState) {
        // To be added later
    }

    override fun updateAddressBarVisibility(isVisible: Boolean) {
        // To be added later
    }

    @Composable
    private fun BrowserToolbar(shouldShowDivider: Boolean, shouldUseBottomToolbar: Boolean) {
        // Ensure the divider is shown together with the toolbar
        Box {
            BrowserToolbar(toolbarStore)
            if (shouldShowDivider) {
                Divider(
                    modifier = Modifier.align(
                        when (shouldUseBottomToolbar) {
                            true -> Alignment.TopCenter
                            false -> Alignment.BottomCenter
                        },
                    ),
                )
            }
        }
    }

    private fun updateHomeAppBarIntegration() {
        if (!settings.shouldUseBottomToolbar) {
            homeBinding.homeAppBar.updateLayoutParams<ViewGroup.MarginLayoutParams> {
                topMargin = context.resources.getDimensionPixelSize(R.dimen.home_fragment_top_toolbar_header_margin) +
                    when (settings.isTabStripEnabled) {
                        true -> context.resources.getDimensionPixelSize(R.dimen.tab_strip_height)
                        false -> 0
                    }
            }
        }
    }

    private fun configureStartingInSearchMode() {
        if (!directToSearchConfig.startSearch) return
        appStore.dispatch(
            SearchStarted(
                tabId = directToSearchConfig.sessionId,
                source = directToSearchConfig.source,
            ),
        )

        if (directToSearchConfig.sessionId != null) {
            browserStore.state.findTab(directToSearchConfig.sessionId)?.let {
                toolbarStore.dispatch(
                    SearchQueryUpdated(
                        query = it.getUrl() ?: "",
                        showAsPreselected = true,
                    ),
                )
            }
        }
    }

    /**
     * Static configuration and properties of [HomeToolbarComposable].
     */
    companion object {
        /**
         * Configuration for starting with the toolbar in search mode.
         *
         * @property startSearch Whether to start in search mode. Defaults to `false`.
         * @property sessionId The session ID of the current session with details of which to start search.
         * Defaults to `null`.
         * @property source The application feature from where a new search was started.
         */
        data class DirectToSearchConfig(
            val startSearch: Boolean = false,
            val sessionId: String? = null,
            val source: MetricsUtils.Source = MetricsUtils.Source.NONE,
        )
    }
}
