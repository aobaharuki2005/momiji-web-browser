/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

/**
 * Function for reducing a new app icon state based on the received action.
 */
internal fun appIconReducer(state: AppIconState, action: AppIconAction) = when (action) {
    is UserAction -> state.handleUserAction(action)
    is SystemAction -> state.handleSystemAction(action)
}

private fun AppIconState.handleUserAction(action: UserAction): AppIconState {
    return when (action) {
        is UserAction.Selected -> this.copy(userSelectedAppIcon = action.appIcon)
        is UserAction.Confirmed -> this
        is UserAction.Dismissed -> this.copy(userSelectedAppIcon = null)
    }
}

private fun AppIconState.handleSystemAction(action: SystemAction): AppIconState {
    return when (action) {
        is SystemAction.Applied -> this.copy(
            currentAppIcon = action.newIcon,
            userSelectedAppIcon = null,
        )
        SystemAction.DialogDismissed -> this.copy(userSelectedAppIcon = null)
        SystemAction.SnackbarDismissed -> this.copy(snackbarState = AppIconSnackbarState.None)
        SystemAction.UpdateFailed -> this.copy(
            userSelectedAppIcon = null,
            snackbarState = AppIconSnackbarState.ApplyingNewIconError,
        )
        is SystemAction.EnvironmentRehydrated -> this
    }
}
