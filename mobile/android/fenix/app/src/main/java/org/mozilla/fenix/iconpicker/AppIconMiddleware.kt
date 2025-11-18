/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * A middleware for handling side-effects in response to [AppIconAction]s.
 *
 * @property updateAppIcon A interface that updates the main activity alias with the newly selected one.
 */
class AppIconMiddleware(
    val updateAppIcon: AppIconUpdater,
) : Middleware<AppIconState, AppIconAction> {

    override fun invoke(
        context: MiddlewareContext<AppIconState, AppIconAction>,
        next: (AppIconAction) -> Unit,
        action: AppIconAction,
    ) {
        next(action)

        when (action) {
            is AppIconAction.ApplyAppIcon -> updateAppIcon(
                new = action.newIcon,
                old = action.currentIcon,
            )

            is AppIconAction.SelectAppIcon, AppIconAction.ResetSelection -> Unit
        }
    }
}

/**
 * An interface for applying a new app icon.
 */
fun interface AppIconUpdater : (AppIcon, AppIcon) -> Unit {
    override fun invoke(new: AppIcon, old: AppIcon)
}
