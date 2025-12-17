/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.ui.tabsearch

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSearchBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import mozilla.components.compose.base.searchbar.TopSearchBar
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.tabstray.TabSearchAction
import org.mozilla.fenix.tabstray.TabsTrayAction
import org.mozilla.fenix.tabstray.TabsTrayState
import org.mozilla.fenix.tabstray.TabsTrayStore
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * The top-level Composable for the Tab Search feature within the Tab Manager.
 *
 * @param store [TabsTrayStore] used to listen for changes to [TabsTrayState].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabSearchScreen(
    store: TabsTrayStore,
) {
    val state by store.observeAsState(store.state) { it }
    val searchBarState = rememberSearchBarState()
    var expanded by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    Scaffold(
        topBar = {
            TopSearchBar(
                state = searchBarState,
                modifier = Modifier.focusRequester(focusRequester),
                query = state.tabSearchState.query,
                onQueryChange = { store.dispatch(TabSearchAction.SearchQueryChanged(it)) },
                onSearch = { submitted -> store.dispatch(TabSearchAction.SearchQueryChanged(submitted)) },
                expanded = expanded,
                onExpandedChange = { expanded = it },
                placeholder = {
                    Text(stringResource(id = R.string.tab_manager_search_bar_placeholder))
                },
                leadingIcon = {
                    IconButton(
                        onClick = {
                            store.dispatch(TabsTrayAction.NavigateBackInvoked)
                        },
                    ) {
                        Icon(
                            painter = painterResource(id = iconsR.drawable.mozac_ic_back_24),
                            contentDescription = stringResource(
                                id = R.string.tab_manager_search_bar_back_content_description,
                            ),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            // TODO Bug 1994286: will add results UI
        }
    }
}

private class TabSearchParameterProvider : PreviewParameterProvider<TabsTrayState> {
    override val values = sequenceOf(
        TabsTrayState(),
    )
}

@PreviewLightDark
@Composable
private fun TabSearchScreenPreview(
    @PreviewParameter(TabSearchParameterProvider::class) state: TabsTrayState,
) {
    val store = remember { TabsTrayStore(initialState = state) }

    FirefoxTheme {
        TabSearchScreen(store)
    }
}
