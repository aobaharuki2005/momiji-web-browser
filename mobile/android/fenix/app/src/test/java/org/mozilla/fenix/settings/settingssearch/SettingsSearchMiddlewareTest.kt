/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.ExperimentalCoroutinesApi
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.mock
import mozilla.components.support.test.rule.MainCoroutineRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class SettingsSearchMiddlewareTest {

    @get:Rule
    val coroutineRule = MainCoroutineRule()

    private var context: Context = mock()

    private fun buildMiddleware(): SettingsSearchMiddleware {
        return SettingsSearchMiddleware(
            SettingsSearchMiddleware.Companion.Dependencies(
                context,
            ),
        )
    }

    @Test
    fun `WHEN the settings search query is updated and results are not found THEN the state is updated`() {
        val middleware = buildMiddleware()
        val capture = CaptureActionsMiddleware<SettingsSearchState, SettingsSearchAction>()
        val query = "test"
        val store = SettingsSearchStore(
            middleware = listOf(
                middleware,
                capture,
            ),
        )

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        store.waitUntilIdle()

        assert(store.state is SettingsSearchState.NoSearchResults)
        assert(store.state.searchQuery == query)
    }
}
