/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation.NavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import mozilla.components.support.test.libstate.ext.waitUntilIdle
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsSearchMiddlewareTest {

    @get:Rule
    val coroutineRule = MainCoroutineRule()

    private val navController: NavController = mockk(relaxed = true)
    private val lifecycleOwner = FakeLifecycleOwner(Lifecycle.State.RESUMED)
    private lateinit var fragment: Fragment
    private val recentSearchesRepository: FenixRecentSettingsSearchesRepository = mockk(relaxed = true)
    private val recentSearchesFlow = MutableStateFlow<List<SettingsSearchItem>>(emptyList())

    @Before
    fun setUp() {
        every { recentSearchesRepository.recentSearches } returns recentSearchesFlow
        fragment = spyk(Fragment()).apply {
            every { context } returns testContext
        }
        every { fragment.viewLifecycleOwner } returns lifecycleOwner
    }

    private fun buildMiddleware(): SettingsSearchMiddleware {
        return SettingsSearchMiddleware(
            fenixSettingsIndexer = TestSettingsIndexer(),
        )
    }

    @Test
    fun `WHEN the settings search query is updated and results are not found THEN the state is updated`() {
        val query = "test"
        val middleware = SettingsSearchMiddleware(
            fenixSettingsIndexer = EmptyTestSettingsIndexer(),
        )
        val store = SettingsSearchStore(middleware = listOf(middleware))
        store.dispatch(
            SettingsSearchAction.EnvironmentRehydrated(
                environment = SettingsSearchEnvironment(
                    fragment = fragment,
                    navController = navController,
                    context = testContext,
                    recentSettingsSearchesRepository = recentSearchesRepository,
                ),
            ),
        )

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        store.waitUntilIdle()
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `WHEN the settings search query is updated and results are found THEN the state is updated`() {
        val query = "a"
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        store.dispatch(
            SettingsSearchAction.EnvironmentRehydrated(
                environment = SettingsSearchEnvironment(
                    fragment = fragment,
                    navController = navController,
                    context = testContext,
                    recentSettingsSearchesRepository = recentSearchesRepository,
                ),
            ),
        )

        store.dispatch(SettingsSearchAction.SearchQueryUpdated(query))
        store.waitUntilIdle()
        assert(store.state is SettingsSearchState.SearchInProgress)
        assert(store.state.searchQuery == query)
    }

    @Test
    fun `WHEN a result item is clicked THEN it should be added to the recent searches repository`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        val testItem = testList.first()

        store.dispatch(SettingsSearchAction.Init)
        store.dispatch(
            SettingsSearchAction.EnvironmentRehydrated(
                environment = SettingsSearchEnvironment(
                    fragment = fragment,
                    navController = navController,
                    context = testContext,
                    recentSettingsSearchesRepository = recentSearchesRepository,
                ),
            ),
        )

        store.dispatch(SettingsSearchAction.ResultItemClicked(testItem))
        store.waitUntilIdle()

        coVerify { recentSearchesRepository.addRecentSearchItem(testItem) }
        verify { navController.navigate(testItem.preferenceFileInformation.fragmentId, any()) }
    }

    @Test
    fun `WHEN RecentSearchesUpdated is dispatched THEN store state is updated correctly`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        val updatedRecents = listOf(testList.first())
        store.dispatch(
            SettingsSearchAction.EnvironmentRehydrated(
                environment = SettingsSearchEnvironment(
                    fragment = fragment,
                    navController = navController,
                    context = testContext,
                    recentSettingsSearchesRepository = recentSearchesRepository,
                ),
            ),
        )

        store.dispatch(SettingsSearchAction.RecentSearchesUpdated(updatedRecents))
        store.waitUntilIdle()

        assert(store.state.recentSearches == updatedRecents)
    }

    @Test
    fun `WHEN ClearRecentSearchesClicked is dispatched THEN store state is updated correctly`() {
        val middleware = buildMiddleware()
        val store = SettingsSearchStore(middleware = listOf(middleware))
        store.dispatch(
            SettingsSearchAction.EnvironmentRehydrated(
                environment = SettingsSearchEnvironment(
                    fragment = fragment,
                    navController = navController,
                    context = testContext,
                    recentSettingsSearchesRepository = recentSearchesRepository,
                ),
            ),
        )

        store.dispatch(SettingsSearchAction.ClearRecentSearchesClicked)
        store.waitUntilIdle()

        assert(store.state.recentSearches.isEmpty())
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

private class FakeLifecycleOwner(initialState: Lifecycle.State) : LifecycleOwner {
    override val lifecycle: Lifecycle = LifecycleRegistry(this).apply {
        currentState = initialState
    }
}
