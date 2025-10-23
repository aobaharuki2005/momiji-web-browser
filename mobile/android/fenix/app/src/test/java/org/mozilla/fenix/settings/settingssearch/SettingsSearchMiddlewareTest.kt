/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import android.content.Context
import androidx.navigation.NavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.mockk
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

    private val navController: NavController = mockk(relaxed = true)

    private fun buildMiddleware(): SettingsSearchMiddleware {
        return SettingsSearchMiddleware(
            initialDependencies = SettingsSearchMiddleware.Companion.Dependencies(
                navController = navController,
            ),
            fenixSettingsIndexer = TestSettingsIndexer(),
        )
    }

    @Test
    fun `WHEN the settings search query is updated and results are not found THEN the state is updated`() {
        val middleware = SettingsSearchMiddleware(
            initialDependencies = SettingsSearchMiddleware.Companion.Dependencies(
                navController = navController,
            ),
            fenixSettingsIndexer = EmptyTestSettingsIndexer(),
        )
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
        capture.assertLastAction(SettingsSearchAction.NoResultsFound::class)
        assert(store.state is SettingsSearchState.NoSearchResults)
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `WHEN the settings search query is updated and results are found THEN the state is updated`() {
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
        capture.assertLastAction(SettingsSearchAction.SearchResultsLoaded::class)
        assert(store.state is SettingsSearchState.SearchInProgress)
        assert(store.state.searchQuery == query)
        assert(store.state.searchResults == testList)
    }
}

val testList = listOf(
    SettingsSearchItem(
        title = "Search Engine",
        summary = "Set your preferred search engine for browsing.",
        preferenceKey = "search_engine_main",
        breadcrumbs = listOf("Search", "Default Search Engine"),
        preferenceFileInformation = PreferenceFileInformation.SearchSettingsPreferences,
    ),
    SettingsSearchItem(
        title = "Advanced Settings",
        summary = "", // Empty or blank summary
        preferenceKey = "advanced_stuff",
        breadcrumbs = listOf("Developer", "Experiments"),
        preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
    ),
    SettingsSearchItem(
        title = "Do not collect usage data",
        summary = "", // Empty or blank summary
        preferenceKey = "do_not_collect_data",
        breadcrumbs = listOf("Privacy", "Usage Data"),
        preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
    ),
)

class TestSettingsIndexer : SettingsIndexer {

    override fun indexAllSettings() {
        // no op
    }

    override suspend fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        return testList
    }
}

class EmptyTestSettingsIndexer : SettingsIndexer {
    override fun indexAllSettings() {
        // no op
    }

    override suspend fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        return emptyList()
    }
}
