/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.content.Context
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] for the settings search screen.
 *
 * @param initialDependencies [Dependencies] for the middleware.
 */
class SettingsSearchMiddleware(
    initialDependencies: Dependencies,
) : Middleware<SettingsSearchState, SettingsSearchAction> {
    var dependencies = initialDependencies

    override fun invoke(
        context: MiddlewareContext<SettingsSearchState, SettingsSearchAction>,
        next: (SettingsSearchAction) -> Unit,
        action: SettingsSearchAction,
    ) {
        val store = context.store as SettingsSearchStore
        when (action) {
            is SettingsSearchAction.SearchQueryUpdated -> {
                next(action)

                if (action.query.isNotBlank()) {
                    store.dispatch(SettingsSearchAction.NoResultsFound(action.query))
                }
            }
            else -> {
                next(action)
                // no op
            }
        }
    }

    companion object {
        data class Dependencies(val context: Context)
    }
}
