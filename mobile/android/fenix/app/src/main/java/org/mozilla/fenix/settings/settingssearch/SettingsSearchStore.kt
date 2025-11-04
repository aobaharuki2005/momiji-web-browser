/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store

/**
 * Store for the settings search screen.
 *
 * @param initialState Initial state of the store.
 * @param middleware List of [Middleware] to apply to the store.
 */
class SettingsSearchStore(
    initialState: SettingsSearchState = SettingsSearchState.Default,
    middleware: List<Middleware<SettingsSearchState, SettingsSearchAction>> = emptyList(),
) : Store<SettingsSearchState, SettingsSearchAction>(
    initialState = initialState,
    reducer = ::reduce,
    middleware = middleware,
)

/**
 * Reducer for the settings search screen.
 */
private fun reduce(state: SettingsSearchState, action: SettingsSearchAction): SettingsSearchState {
    return when (action) {
        is SettingsSearchAction.SearchQueryUpdated -> {
            if (action.query.isBlank()) {
                SettingsSearchState.Default
            } else {
                SettingsSearchState.SearchInProgress(
                    searchQuery = action.query,
                    searchResults = state.searchResults,
                )
            }
        }
        is SettingsSearchAction.NoResultsFound -> {
            if (action.query.isBlank()) {
                SettingsSearchState.Default
            } else {
                SettingsSearchState.NoSearchResults(
                    searchQuery = action.query,
                )
            }
        }
        is SettingsSearchAction.SearchResultsLoaded -> {
            SettingsSearchState.SearchInProgress(
                searchQuery = action.query,
                searchResults = action.results,
            )
        }
        is SettingsSearchAction.ResultItemClicked -> state
    }
}

/**
 * Data class representing the state of the settings search screen.
 *
 * @property searchQuery Current search query [String].
 * @property searchResults List of [SettingsSearchItem]s that match the current search query, if any.
 */
sealed class SettingsSearchState(
    open val searchQuery: String = "",
    open val searchResults: List<SettingsSearchItem> = emptyList(),
) : State {
    /**
     * Default state.
     * No query, no results
     */
    data object Default : SettingsSearchState()

    /**
     * State when there is a query.
     * Query, results.
     *
     * @property searchQuery Current search query [String].
     * @property searchResults List of [SettingsSearchItem]s that match the current search query.
     */
    data class SearchInProgress(
        override val searchQuery: String,
        override val searchResults: List<SettingsSearchItem>,
    ) : SettingsSearchState(searchQuery, searchResults)

    /**
     * State when there is a query but it yields zero search reuslts.
     * Query, no results.
     *
     * @property searchQuery Current search query [String].
     */
    data class NoSearchResults(override val searchQuery: String) : SettingsSearchState(searchQuery)
}
