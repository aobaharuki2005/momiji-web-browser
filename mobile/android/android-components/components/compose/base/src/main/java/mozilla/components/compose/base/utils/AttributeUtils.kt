/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.base.utils

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * Returns the drawable resource object.
 */
@Composable
fun getAttr(resId: Int): Int {
    val typedArray = LocalContext.current.obtainStyledAttributes(intArrayOf(resId))
    val newResId = typedArray.getResourceId(0, 0)
    typedArray.recycle()

    return newResId
}
