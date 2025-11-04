/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.ExperimentalCoroutinesApi
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.mock
import mozilla.components.support.test.rule.MainCoroutineRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class SettingsSearchStoreTest {

    @Test
    fun `GIVEN default state WHEN SearchQueryUpdated action is dispatched THEN query in state is updated`() {
        val query = "theme"
        val store = SettingsSearchStore()

        val initialState = SettingsSearchState.Default
        assert(store.state == initialState)

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        store.waitUntilIdle()

        assert(store.state is SettingsSearchState.SearchInProgress)
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `GIVEN search in progress state WHEN SearchQueryUpdated action is dispatched with empty query THEN default state is dispatched`() {
        val store = SettingsSearchStore(
            initialState = SettingsSearchState.SearchInProgress("theme", emptyList()),
        )
        assert(store.state is SettingsSearchState.SearchInProgress)

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(""))
        store.waitUntilIdle()

        assert(store.state == SettingsSearchState.Default)
    }
}
