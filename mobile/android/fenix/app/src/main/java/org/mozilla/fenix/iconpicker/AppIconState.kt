/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import mozilla.components.lib.state.State

/**
 * Represents the state of the app icon picker screen.
 *
 * @property currentAppIcon The icon currently being used by the application.
 * @property userSelectedAppIcon The icon the user has selected in the picker, if any.
 * @property groupedIconOptions A map of all available app icons.
 */
data class AppIconState(
    val currentAppIcon: AppIcon = AppIcon.AppDefault,
    val userSelectedAppIcon: AppIcon? = null,
    val groupedIconOptions: Map<IconGroupTitle, List<AppIcon>> = mapOf(),
) : State
