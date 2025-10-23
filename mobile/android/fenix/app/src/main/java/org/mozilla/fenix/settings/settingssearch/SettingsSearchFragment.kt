/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalMaterial3Api::class)

package org.mozilla.fenix.settings.settingssearch

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.fragment.app.Fragment
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Fragment for the settings search screen.
 */
class SettingsSearchFragment : Fragment() {

    lateinit var settingsSearchStore: SettingsSearchStore

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = content {
        settingsSearchStore = buildSettingsSearchStore()
        (activity as? AppCompatActivity)?.supportActionBar?.hide()
        FirefoxTheme {
            SettingsSearchScreen(
                store = settingsSearchStore,
                onBackClick = {
                    findNavController().popBackStack()
                },
            )
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        (activity as? AppCompatActivity)?.supportActionBar?.show()
    }

    private fun buildSettingsSearchStore(): SettingsSearchStore {
        return StoreProvider.get(this) {
            SettingsSearchStore(
                initialState = SettingsSearchState.Default,
                middleware = listOf(
                    SettingsSearchMiddleware(
                        SettingsSearchMiddleware.Companion.Dependencies(
                            navController = findNavController(),
                         ),
                        fenixSettingsIndexer = requireContext().components.settingsIndexer,
                    ),
                ),
            )
        }
    }
}
