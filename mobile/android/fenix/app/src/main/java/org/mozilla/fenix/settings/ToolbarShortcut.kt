/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes

/**
 * String keys used to persist and map the selected toolbar shortcut option.
 * These values are stored in preferences and also used to resolve the UI/action.
 */
object ShortcutType {
    const val NEW_TAB = "new_tab"
    const val SHARE = "share"
    const val BOOKMARK = "bookmark"
    const val TRANSLATE = "translate"
    const val HOMEPAGE = "homepage"
    const val BACK = "back"
}

internal data class ShortcutOption(
    val key: String,
    @param:DrawableRes val icon: Int,
    @param:StringRes val label: Int,
)
