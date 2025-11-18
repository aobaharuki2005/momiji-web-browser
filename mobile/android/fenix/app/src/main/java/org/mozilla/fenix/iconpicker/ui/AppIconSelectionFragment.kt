/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import android.content.ComponentName
import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import mozilla.components.support.base.feature.UserInteractionHandler
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.showToolbar
import org.mozilla.fenix.iconpicker.AppIconMiddleware
import org.mozilla.fenix.iconpicker.AppIconRepository
import org.mozilla.fenix.iconpicker.AppIconState
import org.mozilla.fenix.iconpicker.AppIconStore
import org.mozilla.fenix.iconpicker.DefaultAppIconRepository
import org.mozilla.fenix.iconpicker.DefaultPackageManagerWrapper
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.ShortcutManagerWrapperDefault
import org.mozilla.fenix.utils.ShortcutsUpdaterDefault
import org.mozilla.fenix.utils.changeAppLauncherIcon

/**
 * Fragment that displays a list of alternative app icons.
 */
class AppIconSelectionFragment : Fragment(), UserInteractionHandler {

    private val appIconRepository: AppIconRepository by lazy {
        DefaultAppIconRepository(
            packageManager = DefaultPackageManagerWrapper(requireContext().packageManager),
            packageName = requireContext().packageName,
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        FirefoxTheme {
            AppIconSelection(
                store = AppIconStore(
                    initialState = AppIconState(
                        currentAppIcon = appIconRepository.selectedAppIcon,
                        groupedIconOptions = appIconRepository.groupedAppIcons,
                    ),
                    middleware = listOf(
                        AppIconMiddleware(
                            updateAppIcon = { newIcon, currentIcon ->
                                updateAppIcon(
                                    currentAliasSuffix = currentIcon.aliasSuffix,
                                    newAliasSuffix = newIcon.aliasSuffix,
                                )
                            },
                        ),
                    ),
                ),
            )
        }
    }

    private fun updateAppIcon(
        currentAliasSuffix: String,
        newAliasSuffix: String,
    ): Boolean {
        with(requireContext()) {
            return changeAppLauncherIcon(
                packageManager = packageManager,
                shortcutManager = ShortcutManagerWrapperDefault(this),
                shortcutInfo = ShortcutsUpdaterDefault(this),
                appAlias = ComponentName(this, "$packageName.$currentAliasSuffix"),
                newAppAlias = ComponentName(this, "$packageName.$newAliasSuffix"),
            )
        }
    }

    override fun onResume() {
        super.onResume()
        showToolbar(getString(R.string.preferences_app_icon))
    }

    override fun onBackPressed() = findNavController().popBackStack()
}
