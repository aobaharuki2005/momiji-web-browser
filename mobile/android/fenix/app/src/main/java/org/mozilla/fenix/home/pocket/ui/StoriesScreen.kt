/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.utils.BackInvokedHandler
import org.mozilla.fenix.R
import org.mozilla.fenix.components.appstate.recommendations.ContentRecommendationsState
import org.mozilla.fenix.home.fake.FakeHomepagePreview
import org.mozilla.fenix.home.pocket.interactor.PocketStoriesInteractor
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

/**
 * Stories screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoriesScreen(
    state: ContentRecommendationsState,
    interactor: PocketStoriesInteractor,
    onNavigationIconClick: () -> Unit,
) {
    BackInvokedHandler {
        onNavigationIconClick()
    }

    val scrollBehavior = TopAppBarDefaults.enterAlwaysScrollBehavior()
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.pocket_stories_header_2),
                        color = MaterialTheme.colorScheme.onSurface,
                        style = FirefoxTheme.typography.headline5,
                    )
                },
                modifier = Modifier
                    .fillMaxWidth(),
                navigationIcon = {
                    IconButton(onClick = onNavigationIconClick) {
                        Icon(
                            painter = painterResource(iconsR.drawable.mozac_ic_back_24),
                            contentDescription = stringResource(R.string.stories_back_button_content_description),
                            tint = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                },
                windowInsets = WindowInsets(
                    top = 0.dp,
                    bottom = 0.dp,
                ),
                scrollBehavior = scrollBehavior,
            )
        },
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxSize()
            .nestedScroll(scrollBehavior.nestedScrollConnection),
    ) { paddingValues ->
        StoriesScreenContent(
            state = state,
            paddingValues = paddingValues,
            interactor = interactor,
        )
    }
}

@Composable
private fun StoriesScreenContent(
    state: ContentRecommendationsState,
    paddingValues: PaddingValues,
    interactor: PocketStoriesInteractor,
) {
    Column(
        modifier = Modifier.padding(top = paddingValues.calculateTopPadding()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Stories(
            state = state,
            interactor = interactor,
        )
    }
}

@Composable
private fun Stories(
    state: ContentRecommendationsState,
    interactor: PocketStoriesInteractor,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(1),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        itemsIndexed(state.pocketStories) { index, story ->
            StoryCard(
                modifier = Modifier.padding(horizontal = 16.dp),
                story = story,
                onClick = interactor::onStoryClicked,
            )
        }
    }
}

@Composable
@FlexibleWindowLightDarkPreview
private fun ShortcutsScreenPreviews() {
    FirefoxTheme {
        StoriesScreen(
            state = ContentRecommendationsState(
                pocketStories = FakeHomepagePreview.pocketStories(),
            ),
            interactor = FakeHomepagePreview.storiesInteractor,
            onNavigationIconClick = {},
        )
    }
}
