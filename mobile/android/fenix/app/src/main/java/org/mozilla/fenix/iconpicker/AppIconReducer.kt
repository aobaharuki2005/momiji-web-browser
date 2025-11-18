/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

/**
 * Function for reducing a new app icon state based on the received action.
 */
internal fun appIconReducer(state: AppIconState, action: AppIconAction) = when (action) {
    is AppIconAction.SelectAppIcon -> state.copy(userSelectedAppIcon = action.appIcon)
    AppIconAction.ResetSelection -> state.copy(userSelectedAppIcon = null)
    is AppIconAction.ApplyAppIcon -> state.copy(currentAppIcon = action.newIcon, userSelectedAppIcon = null)
}
