/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import mozilla.components.support.base.feature.UserInteractionHandler
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.showToolbar
import org.mozilla.fenix.iconpicker.ActivityAlias
import org.mozilla.fenix.iconpicker.SettingsAppIcon
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Fragment that displays a list of alternative app icons.
 */
class AppIconSelectionFragment : Fragment(), UserInteractionHandler {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = ComposeView(requireContext()).apply {
        setContent {
            FirefoxTheme {
                AppIconSelection(
                    currentAppIcon = ActivityAlias.AppDefault,
                    groupedIconOptions = SettingsAppIcon.groupedAppIcons,
                    onClick = {},
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        showToolbar(getString(R.string.preferences_app_icon))
    }

    override fun onBackPressed() = findNavController().popBackStack()
}
