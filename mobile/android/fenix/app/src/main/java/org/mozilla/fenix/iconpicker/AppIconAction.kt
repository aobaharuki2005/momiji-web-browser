/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import mozilla.components.lib.state.Action

/**
 * Actions related to the app icon selection screen.
 */
sealed interface AppIconAction : Action {
    /**
     * User has selected a new [appIcon] to set as the app icon. This does not mean it is applied.
     *
     * @property appIcon the new selected icon.
     */
    data class SelectAppIcon(val appIcon: AppIcon) : AppIconAction

    /**
     * Reset the selection from the one selected by the user back to the icon currently used by the app.
     */
    data object ResetSelection : AppIconAction

    /**
     * Set the new icon as the app icon on a system level.
     *
     * @property newIcon the icon to apply.
     * @property currentIcon the current app icon used by the system.
     */
    data class ApplyAppIcon(val newIcon: AppIcon, val currentIcon: AppIcon) : AppIconAction
}
