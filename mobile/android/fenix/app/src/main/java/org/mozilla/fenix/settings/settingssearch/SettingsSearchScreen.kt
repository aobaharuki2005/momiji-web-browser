/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.IconButton
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.R
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

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
                query = state.searchQuery,
                onSearchQueryChanged = {
                    store.dispatch(SettingsSearchAction.SearchQueryUpdated(it))
                },
                onClearSearchClicked = {
                    store.dispatch(SettingsSearchAction.SearchQueryUpdated(""))
                },
                onBackClick = onBackClick,
            )
        },
    ) { paddingValues ->
        Column(
            modifier = Modifier.padding(paddingValues),
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.settings_search_empty_query_placeholder),
                    style = FirefoxTheme.typography.body2,
                    color = FirefoxTheme.colors.textSecondary,
                )
            }
        }
    }
}

/**
 * Composable for the settings search bar.
 *
 * @param query Current search query [String].
 * @param onSearchQueryChanged Callback for when the search query changes.
 * @param onClearSearchClicked Callback for when the clear search button is clicked.
 * @param onBackClick Callback for when the back button is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSearchBar(
    query: String,
    onSearchQueryChanged: (String) -> Unit,
    onClearSearchClicked: () -> Unit,
    onBackClick: () -> Unit,
) {
    TopAppBar(
        title = {
            TextField(
                value = query,
                onValueChange = { value ->
                    onSearchQueryChanged(value)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(end = 8.dp),
                placeholder = stringResource(R.string.settings_search_title),
                singleLine = true,
                errorText = stringResource(R.string.settings_search_error_message),
                trailingIcons = {
                    if (query.isNotBlank()) {
                        IconButton(
                            onClick = onClearSearchClicked,
                            contentDescription = stringResource(
                                R.string.content_description_settings_search_clear_search,
                            ),
                        ) {
                            Icon(
                                painter = painterResource(iconsR.drawable.mozac_ic_cross_24),
                                contentDescription = null,
                                tint = FirefoxTheme.colors.textPrimary,
                            )
                        }
                    }
                },
            )
        },
        navigationIcon = {
            IconButton(
                onClick = onBackClick,
                contentDescription =
                    stringResource(
                        R.string.content_description_settings_search_navigate_back,
                    ),
                ) {
                Icon(
                    painter = painterResource(
                        iconsR.drawable.mozac_ic_back_24,
                    ),
                    contentDescription = null,
                    tint = FirefoxTheme.colors.textPrimary,
                )
            }
        },
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
    )
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
