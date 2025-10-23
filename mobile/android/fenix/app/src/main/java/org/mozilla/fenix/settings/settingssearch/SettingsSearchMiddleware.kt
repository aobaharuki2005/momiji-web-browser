/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.core.os.bundleOf
import androidx.navigation.NavController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] for the settings search screen.
 *
 * @param initialDependencies [Dependencies] to use for navigation.
 * @property fenixSettingsIndexer [SettingsIndexer] to use for indexing and querying settings.
 */
class SettingsSearchMiddleware(
    initialDependencies: Dependencies,
    val fenixSettingsIndexer: SettingsIndexer,
) : Middleware<SettingsSearchState, SettingsSearchAction> {
    var dependencies = initialDependencies

    init {
        fenixSettingsIndexer.indexAllSettings()
    }

    override fun invoke(
        context: MiddlewareContext<SettingsSearchState, SettingsSearchAction>,
        next: (SettingsSearchAction) -> Unit,
        action: SettingsSearchAction,
    ) {
        val store = context.store as SettingsSearchStore
        when (action) {
            is SettingsSearchAction.SearchQueryUpdated -> {
                next(action)
                CoroutineScope(Dispatchers.Main).launch {
                    val results = fenixSettingsIndexer.getSettingsWithQuery(action.query)
                    if (results.isEmpty()) {
                        store.dispatch(SettingsSearchAction.NoResultsFound(action.query))
                    } else {
                        store.dispatch(
                            SettingsSearchAction.SearchResultsLoaded(
                                query = action.query,
                                results = results,
                            ),
                        )
                    }
                }
            }
            is SettingsSearchAction.ResultItemClicked -> {
                val searchItem = action.item
                val bundle = bundleOf(
                    "preference_to_scroll_to" to searchItem.preferenceKey,
                    "search_in_progress" to true,
                )
                val fragmentId = searchItem.preferenceFileInformation.fragmentId
                CoroutineScope(Dispatchers.Main).launch {
                    dependencies.navController.navigate(fragmentId, bundle)
                }
            }
            else -> {
                next(action)
                // no op in middleware layer
            }
        }
    }

    companion object {
        data class Dependencies(
            val navController: NavController,
        )
    }
}
