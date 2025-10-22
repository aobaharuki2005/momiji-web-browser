/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] for the settings search screen.
 *
 * @property fenixSettingsIndexer [SettingsIndexer] to use for indexing and querying settings.
 */
class SettingsSearchMiddleware(
    val fenixSettingsIndexer: SettingsIndexer,
) : Middleware<SettingsSearchState, SettingsSearchAction> {

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
            else -> {
                next(action)
                // no op in middleware layer
            }
        }
    }
}
