/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Composable for the settings search screen.
 *
 * @param store [SettingsSearchStore] for the screen.
 * @param onBackClick Callback for when the back button is clicked.
 */
@Composable
fun SettingsSearchScreen(
    store: SettingsSearchStore,
    onBackClick: () -> Unit,
) {
    val state by store.observeAsComposableState { it }
    Scaffold(
        topBar = {
            SettingsSearchBar(
                store = store,
                onBackClick = onBackClick,
            )
        },
    ) { paddingValues ->
        when (state) {
            is SettingsSearchState.Default -> {
                SettingsSearchMessageContent(
                    modifier = Modifier
                        .padding(paddingValues)
                        .fillMaxSize(),
                )
            }
            is SettingsSearchState.NoSearchResults -> {
                SettingsSearchMessageContent(
                    modifier = Modifier
                        .padding(paddingValues)
                        .fillMaxSize(),
                    currentUserQuery = state.searchQuery,
                    )
            }
            is SettingsSearchState.SearchInProgress -> {
                LazyColumn(
                    modifier = Modifier
                        .padding(paddingValues)
                        .fillMaxSize(),
                ) {
                    items(state.searchResults.size) { index ->
                        val settingsSearchItem = state.searchResults[index]
                        if (index != 0) {
                            HorizontalDivider()
                        }
                        SettingsSearchResultItem(
                            item = settingsSearchItem,
                            query = state.searchQuery,
                            onClick = {
                                store.dispatch(
                                    SettingsSearchAction.ResultItemClicked(
                                        settingsSearchItem,
                                    ),
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSearchMessageContent(
    modifier: Modifier = Modifier,
    currentUserQuery: String = "",
) {
    val displayMessage = if (currentUserQuery.isBlank()) {
        stringResource(R.string.settings_search_empty_query_placeholder)
    } else {
        stringResource(
            R.string.setttings_search_no_results_found_message,
            currentUserQuery,
        )
    }
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = displayMessage,
            textAlign = TextAlign.Center,
            style = FirefoxTheme.typography.body2,
            color = FirefoxTheme.colors.textSecondary,
        )
    }
}

/**
 * Preview for the settings search screen initial state.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchScreenInitialStatePreview() {
    FirefoxTheme {
        SettingsSearchScreen(
            store = SettingsSearchStore(),
            onBackClick = {},
        )
    }
}
