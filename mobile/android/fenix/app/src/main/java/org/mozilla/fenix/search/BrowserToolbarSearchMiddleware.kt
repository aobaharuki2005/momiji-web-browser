/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.search

import android.content.res.Resources
import android.os.Build
import androidx.annotation.VisibleForTesting
import androidx.core.graphics.drawable.toDrawable
import androidx.lifecycle.Lifecycle.State.RESUMED
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.NavController
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.launch
import mozilla.components.browser.state.action.AwesomeBarAction.EngagementFinished
import mozilla.components.browser.state.search.SearchEngine
import mozilla.components.browser.state.search.SearchEngine.Type.APPLICATION
import mozilla.components.browser.state.search.SearchEngine.Type.CUSTOM
import mozilla.components.browser.state.state.selectedOrDefaultSearchEngine
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.browser.toolbar.BrowserToolbar
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButton
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.AutocompleteProvidersUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.HintUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchAborted
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchActionsEndUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchActionsStartUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.SearchQueryUpdated
import mozilla.components.compose.browser.toolbar.store.BrowserEditToolbarAction.UrlSuggestionAutocompleted
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.CommitUrl
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarAction.ToggleEditMode
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarMenu
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarState
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.compose.browser.toolbar.store.EnvironmentCleared
import mozilla.components.compose.browser.toolbar.store.EnvironmentRehydrated
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store
import mozilla.components.lib.state.ext.flow
import mozilla.components.support.ktx.kotlin.isUrl
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Events
import org.mozilla.fenix.GleanMetrics.UnifiedSearch
import org.mozilla.fenix.NavGraphDirections
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.BrowserFragmentDirections
import org.mozilla.fenix.browser.browsingmode.BrowsingMode.Private
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEngineSelected
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchStarted
import org.mozilla.fenix.components.metrics.MetricsUtils
import org.mozilla.fenix.components.search.BOOKMARKS_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.HISTORY_SEARCH_ENGINE_ID
import org.mozilla.fenix.components.search.TABS_SEARCH_ENGINE_ID
import org.mozilla.fenix.ext.toolbarHintRes
import org.mozilla.fenix.home.toolbar.HomeToolbarEnvironment
import org.mozilla.fenix.search.EditPageEndActionsInteractions.ClearSearchClicked
import org.mozilla.fenix.search.EditPageEndActionsInteractions.QrScannerClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSelectorClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSelectorItemClicked
import org.mozilla.fenix.search.SearchSelectorEvents.SearchSettingsItemClicked
import org.mozilla.fenix.search.ext.searchEngineShortcuts
import org.mozilla.fenix.settings.SupportUtils
import org.mozilla.fenix.utils.Settings
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.ContentDescription.StringContentDescription as SearchSelectorDescription
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.Icon.DrawableIcon as SearchSelectorIcon
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.ContentDescription.StringContentDescription as MenuItemStringDescription
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.ContentDescription.StringResContentDescription as MenuItemDescriptionRes
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Icon.DrawableIcon as MenuItemIcon
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Icon.DrawableResIcon as MenuItemIconRes
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Text.StringResText as MenuItemStringResText
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarMenuItem.BrowserToolbarMenuButton.Text.StringText as MenuItemStringText
import mozilla.components.lib.state.Action as MVIAction

@VisibleForTesting
internal sealed class SearchSelectorEvents : BrowserToolbarEvent {
    data object SearchSelectorClicked : SearchSelectorEvents()

    data object SearchSettingsItemClicked : SearchSelectorEvents()

    data class SearchSelectorItemClicked(
        val searchEngine: SearchEngine,
    ) : SearchSelectorEvents()
}

@VisibleForTesting
internal sealed class EditPageEndActionsInteractions : BrowserToolbarEvent {
    data object ClearSearchClicked : EditPageEndActionsInteractions()
    data object QrScannerClicked : EditPageEndActionsInteractions()
}

/**
 * [BrowserToolbarStore] middleware handling the configuration of the composable toolbar
 * while in edit mode.
 *
 * @param appStore [AppStore] used for querying and updating application state.
 * @param browserStore [BrowserStore] used for querying and updating browser state.
 * @param components [Components] for accessing other functionalities of the application.
 * @param settings [Settings] for accessing application settings.
 */
class BrowserToolbarSearchMiddleware(
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val components: Components,
    private val settings: Settings,
) : Middleware<BrowserToolbarState, BrowserToolbarAction> {
    @VisibleForTesting
    internal var environment: HomeToolbarEnvironment? = null
    private var syncCurrentSearchEngineJob: Job? = null
    private var syncAvailableSearchEnginesJob: Job? = null
    private var observeQRScannerInputJob: Job? = null

    @Suppress("CyclomaticComplexMethod", "LongMethod")
    override fun invoke(
        context: MiddlewareContext<BrowserToolbarState, BrowserToolbarAction>,
        next: (BrowserToolbarAction) -> Unit,
        action: BrowserToolbarAction,
    ) {
        if (action !is SearchSelectorEvents) {
            next(action)
        }

        when (action) {
            is EnvironmentRehydrated -> {
                environment = action.environment as? HomeToolbarEnvironment

                if (context.store.state.isEditMode()) {
                    syncCurrentSearchEngine(context.store)
                }
            }

            is EnvironmentCleared -> {
                environment = null
                context.store.dispatch(AutocompleteProvidersUpdated(emptyList()))
            }

            is ToggleEditMode -> {
                if (action.editMode) {
                    refreshConfigurationAfterSearchEngineChange(
                        store = context.store,
                        searchEngine = reconcileSelectedEngine(),
                    )
                    syncCurrentSearchEngine(context.store)
                    syncAvailableEngines(context.store)
                    updateSearchEndPageActions(context.store)
                } else {
                    syncCurrentSearchEngineJob?.cancel()
                    syncAvailableSearchEnginesJob?.cancel()

                    if (observeQRScannerInputJob?.isActive == true) {
                        appStore.dispatch(AppAction.QrScannerAction.QrScannerDismissed)
                    }
                    observeQRScannerInputJob?.cancel()
                }
            }

            is SearchAborted -> {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    val sourceTabId = appStore.state.searchState.sourceTabId
                    appStore.dispatch(SearchEnded)
                    browserStore.dispatch(EngagementFinished(abandoned = true))
                    if (sourceTabId != null) {
                        environment?.navController?.navigate(R.id.browserFragment)
                    }
                }
            }

            is SearchSelectorClicked -> {
                UnifiedSearch.searchMenuTapped.record(NoExtras())
            }

            is SearchSettingsItemClicked -> {
                context.store.dispatch(SearchQueryUpdated(""))
                appStore.dispatch(SearchEnded)
                browserStore.dispatch(EngagementFinished(abandoned = true))
                environment?.navController?.navigate(
                    BrowserFragmentDirections.actionGlobalSearchEngineFragment(),
                )
            }

            is SearchSelectorItemClicked -> {
                appStore.dispatch(SearchEngineSelected(action.searchEngine, true))
                appStore.dispatch(SearchStarted())
                refreshConfigurationAfterSearchEngineChange(context.store, action.searchEngine)
            }

            is UrlSuggestionAutocompleted -> {
                components.core.engine.speculativeConnect(action.url)
            }

            is CommitUrl -> {
                // Do not load URL if application search engine is selected.
                if (reconcileSelectedEngine()?.type == SearchEngine.Type.APPLICATION) {
                    return
                }

                val navController = environment?.navController ?: return

                when (action.text) {
                    "about:crashes" -> {
                        // The list of past crashes can be accessed via "settings > about", but desktop and
                        // fennec users may be used to navigating to "about:crashes". So we intercept this here
                        // and open the crash list activity instead.
                        navController.navigate(
                            NavGraphDirections.actionGlobalCrashListFragment(),
                        )
                    }
                    "about:addons" -> {
                        navController.navigate(
                            NavGraphDirections.actionGlobalAddonsManagementFragment(),
                        )
                        browserStore.dispatch(EngagementFinished(abandoned = false))
                    }
                    "about:glean" -> {
                        navController.navigate(
                            NavGraphDirections.actionGlobalGleanDebugToolsFragment(),
                        )
                    }
                    "moz://a" -> openSearchOrUrl(
                        SupportUtils.getMozillaPageUrl(SupportUtils.MozillaPage.MANIFESTO),
                        navController,
                    )
                    else ->
                        if (action.text.isNotBlank()) {
                            openSearchOrUrl(action.text, navController)
                        } else {
                            browserStore.dispatch(EngagementFinished(abandoned = true))
                        }
                }

                appStore.dispatch(SearchEnded)
            }

            is ClearSearchClicked -> {
                context.store.dispatch(SearchQueryUpdated(""))
            }

            is SearchQueryUpdated -> {
                updateSearchEndPageActions(context.store)
            }

            is QrScannerClicked -> {
                observeQrScannerInput(context.store)
                appStore.dispatch(AppAction.QrScannerAction.QrScannerRequested)
            }

            else -> {
                // no-op.
            }
        }
    }

    private fun openSearchOrUrl(text: String, navController: NavController) {
        val searchEngine = reconcileSelectedEngine()
        val isDefaultEngine = searchEngine?.id == browserStore.state.search.regionDefaultSearchEngineId
        val newTab = if (settings.enableHomepageAsNewTab) {
            false
        } else {
            appStore.state.searchState.sourceTabId == null
        }

        navController.navigate(
            NavGraphDirections.actionGlobalBrowser(),
        )

        components.useCases.fenixBrowserUseCases.loadUrlOrSearch(
            searchTermOrURL = text,
            newTab = newTab,
            forceSearch = !isDefaultEngine,
            private = environment?.browsingModeManager?.mode == Private,
            searchEngine = searchEngine,
        )

        if (text.isUrl() || searchEngine == null) {
            Events.enteredUrl.record(Events.EnteredUrlExtra(autocomplete = false))
        } else {
            val searchAccessPoint = when (appStore.state.searchState.searchAccessPoint) {
                MetricsUtils.Source.NONE -> MetricsUtils.Source.ACTION
                else -> appStore.state.searchState.searchAccessPoint
            }

            MetricsUtils.recordSearchMetrics(
                searchEngine,
                isDefaultEngine,
                searchAccessPoint,
                components.nimbus.events,
            )
        }

        browserStore.dispatch(EngagementFinished(abandoned = false))
    }

    private fun refreshConfigurationAfterSearchEngineChange(
        store: Store<BrowserToolbarState, BrowserToolbarAction>,
        searchEngine: SearchEngine?,
    ) {
        updateSearchSelectorMenu(store, searchEngine, browserStore.state.search.searchEngineShortcuts)
        updateAutocompleteProviders(store, searchEngine)
        updateToolbarHint(store, searchEngine)
    }

    private fun updateToolbarHint(
        store: Store<BrowserToolbarState, BrowserToolbarAction>,
        engine: SearchEngine?,
    ) {
        val defaultEngine = browserStore.state.search.selectedOrDefaultSearchEngine
        val hintRes = engine.toolbarHintRes(defaultEngine)
        store.dispatch(HintUpdated(hintRes))
    }

    /**
     * Synchronously update the toolbar with a new search selector.
     */
    private fun updateSearchSelectorMenu(
        store: Store<BrowserToolbarState, BrowserToolbarAction>,
        selectedSearchEngine: SearchEngine?,
        searchEngineShortcuts: List<SearchEngine>,
    ) {
        val environment = environment ?: return

        val searchSelector = buildSearchSelector(
            selectedSearchEngine, searchEngineShortcuts, environment.context.resources,
        )
        store.dispatch(
            SearchActionsStartUpdated(
                when (searchSelector == null) {
                    true -> emptyList()
                    else -> listOf(searchSelector)
                },
            ),
        )
    }

    private fun updateAutocompleteProviders(
        store: Store<BrowserToolbarState, BrowserToolbarAction>,
        selectedSearchEngine: SearchEngine?,
    ) {
        if (settings.shouldAutocompleteInAwesomebar) {
            val autocompleteProviders = buildAutocompleteProvidersList(selectedSearchEngine)
            store.dispatch(AutocompleteProvidersUpdated(autocompleteProviders))
        } else {
            store.dispatch(AutocompleteProvidersUpdated(emptyList()))
        }
    }

    private fun buildAutocompleteProvidersList(selectedSearchEngine: SearchEngine?) = when (selectedSearchEngine?.id) {
        browserStore.state.search.selectedOrDefaultSearchEngine?.id -> listOfNotNull(
            when (settings.shouldShowHistorySuggestions) {
                true -> components.core.historyStorage
                false -> null
            },
            when (settings.shouldShowBookmarkSuggestions) {
                true -> components.core.bookmarksStorage
                false -> null
            },
            components.core.domainsAutocompleteProvider,
        )

        TABS_SEARCH_ENGINE_ID -> listOf(
            components.core.sessionAutocompleteProvider,
            components.backgroundServices.syncedTabsAutocompleteProvider,
        )

        BOOKMARKS_SEARCH_ENGINE_ID -> listOf(
            components.core.bookmarksStorage,
        )

        HISTORY_SEARCH_ENGINE_ID -> listOf(
            components.core.historyStorage,
        )

        else -> emptyList()
    }

    private fun syncCurrentSearchEngine(store: Store<BrowserToolbarState, BrowserToolbarAction>) {
        syncCurrentSearchEngineJob?.cancel()
        syncCurrentSearchEngineJob = appStore.observeWhileActive {
            distinctUntilChangedBy { it.searchState.selectedSearchEngine?.searchEngine }
                .collect {
                    it.searchState.selectedSearchEngine?.let {
                        refreshConfigurationAfterSearchEngineChange(store, it.searchEngine)
                    }
                }
        }
    }

    private fun syncAvailableEngines(store: Store<BrowserToolbarState, BrowserToolbarAction>) {
        syncAvailableSearchEnginesJob?.cancel()
        syncAvailableSearchEnginesJob = browserStore.observeWhileActive {
            distinctUntilChangedBy { it.search.searchEngineShortcuts }
                .collect {
                    refreshConfigurationAfterSearchEngineChange(
                        store = store,
                        searchEngine = reconcileSelectedEngine(),
                    )
                }
        }
    }

    private fun reconcileSelectedEngine(): SearchEngine? =
        appStore.state.searchState.selectedSearchEngine?.searchEngine
            ?: browserStore.state.search.selectedOrDefaultSearchEngine

    private fun updateSearchEndPageActions(
        store: Store<BrowserToolbarState, BrowserToolbarAction>,
        selectedSearchEngine: SearchEngine? = reconcileSelectedEngine(),
    ) = store.dispatch(
        SearchActionsEndUpdated(
            buildSearchEndPageActions(
                store.state.editState.query,
                selectedSearchEngine,
            ),
        ),
    )

    private fun buildSearchEndPageActions(
        queryText: String,
        selectedSearchEngine: SearchEngine?,
    ): List<Action> = buildList {
        val isValidSearchEngine = selectedSearchEngine?.isGeneral == true ||
                selectedSearchEngine?.type == CUSTOM
        if (isValidSearchEngine) {
            add(
                ActionButtonRes(
                    drawableResId = R.drawable.mozac_ic_qr_code_24,
                    contentDescription = R.string.mozac_feature_qr_scanner,
                    state = ActionButton.State.DEFAULT,
                    onClick = QrScannerClicked,
                ),
            )
        }
        if (queryText.isNotEmpty()) {
            add(
                ActionButtonRes(
                    drawableResId = R.drawable.mozac_ic_cross_circle_fill_24,
                    contentDescription = R.string.mozac_clear_button_description,
                    state = ActionButton.State.DEFAULT,
                    onClick = ClearSearchClicked,
                ),
            )
        }
    }

    private fun observeQrScannerInput(store: Store<BrowserToolbarState, BrowserToolbarAction>) {
        observeQRScannerInputJob = null
        observeQRScannerInputJob = appStore.observeWhileActive {
            distinctUntilChangedBy { it.qrScannerState.lastScanData }
                .collect {
                    if (it.qrScannerState.lastScanData?.isNotEmpty() == true) {
                        appStore.dispatch(AppAction.QrScannerAction.QrScannerInputConsumed)
                        store.dispatch(SearchQueryUpdated(it.qrScannerState.lastScanData))
                        observeQRScannerInputJob?.cancel()
                    }
                }
        }
    }

    private inline fun <S : State, A : MVIAction> Store<S, A>.observeWhileActive(
        crossinline observe: suspend (Flow<S>.() -> Unit),
    ): Job? = environment?.viewLifecycleOwner?.run {
        lifecycleScope.launch {
            repeatOnLifecycle(RESUMED) {
                flow().observe()
            }
        }
    }

    /**
     * Static functionalities of the [BrowserToolbarSearchMiddleware].
     */
    companion object {
        /**
         * Builds a [SearchSelectorAction] to be shown in the [BrowserToolbar].
         *
         * @param selectedSearchEngine The currently selected search engine.
         * @param searchEngineShortcuts The list of search engines available for selection.
         * @param resources [Resources] Used for accessing application resources.
         */
        fun buildSearchSelector(
            selectedSearchEngine: SearchEngine?,
            searchEngineShortcuts: List<SearchEngine>,
            resources: Resources,
        ): SearchSelectorAction? {
            if (selectedSearchEngine == null) {
                return null
            }

            val menuItems = buildList<BrowserToolbarMenuItem> {
                add(
                    BrowserToolbarMenuButton(
                        icon = null,
                        text = MenuItemStringResText(R.string.search_header_menu_item_2),
                        contentDescription = MenuItemDescriptionRes(R.string.search_header_menu_item_2),
                        onClick = null,
                    ),
                )
                addAll(searchEngineShortcuts.toToolbarMenuItems(resources))
                add(
                    BrowserToolbarMenuButton(
                        icon = MenuItemIconRes(R.drawable.mozac_ic_settings_24),
                        text = MenuItemStringResText(R.string.search_settings_menu_item),
                        contentDescription = MenuItemDescriptionRes(R.string.search_settings_menu_item),
                        onClick = SearchSettingsItemClicked,
                    ),
                )
            }

            return SearchSelectorAction(
                icon = SearchSelectorIcon(
                    drawable = selectedSearchEngine.icon.toDrawable(resources),
                    shouldTint = selectedSearchEngine.type == APPLICATION,
                ),
                contentDescription = SearchSelectorDescription(
                    resources.getString(
                        R.string.search_engine_selector_content_description,
                        selectedSearchEngine.name,
                    ),
                ),
                menu = BrowserToolbarMenu { menuItems },
                onClick = SearchSelectorClicked,
            )
        }

        private fun List<SearchEngine>.toToolbarMenuItems(
            resources: Resources,
        ) = map { searchEngine ->
            BrowserToolbarMenuButton(
                icon = MenuItemIcon(
                    drawable = searchEngine.icon.toDrawable(resources),
                    shouldTint = searchEngine.type == APPLICATION,
                ),
                text = MenuItemStringText(searchEngine.name),
                contentDescription = MenuItemStringDescription(searchEngine.name),
                onClick = SearchSelectorItemClicked(searchEngine),
            )
        }
    }
}
