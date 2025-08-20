/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.pocket

import android.os.Bundle
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.components.appstate.recommendations.ContentRecommendationsState
import org.mozilla.fenix.components.components
import org.mozilla.fenix.compose.ComposeFragment
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.home.pocket.controller.DefaultPocketStoriesController
import org.mozilla.fenix.home.pocket.controller.PocketStoriesController
import org.mozilla.fenix.home.pocket.interactor.DefaultPocketStoriesInteractor
import org.mozilla.fenix.home.pocket.interactor.PocketStoriesInteractor
import org.mozilla.fenix.home.pocket.ui.StoriesScreen
import org.mozilla.fenix.theme.FirefoxTheme
import java.lang.ref.WeakReference

/**
 * A [ComposeFragment] displaying the stories screen.
 */
class StoriesFragment : ComposeFragment() {

    private lateinit var interactor: PocketStoriesInteractor
    private lateinit var controller: PocketStoriesController

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        controller = DefaultPocketStoriesController(
            navControllerRef = WeakReference(findNavController()),
            appStore = requireComponents.appStore,
            settings = requireComponents.settings,
            fenixBrowserUseCases = requireComponents.useCases.fenixBrowserUseCases,
            marsUseCases = requireComponents.useCases.marsUseCases,
            viewLifecycleScope = viewLifecycleOwner.lifecycleScope,
        )

        interactor = DefaultPocketStoriesInteractor(
            controller = controller,
        )
    }

    @Composable
    override fun UI() {
        FirefoxTheme {
            val appStore = components.appStore
            val storiesState by appStore.observeAsState(initialValue = ContentRecommendationsState()) { state ->
                state.recommendationState
            }

            StoriesScreen(
                state = storiesState,
                interactor = interactor,
                onNavigationIconClick = {
                    this@StoriesFragment.findNavController().popBackStack()
                },
            )
        }
    }
}
