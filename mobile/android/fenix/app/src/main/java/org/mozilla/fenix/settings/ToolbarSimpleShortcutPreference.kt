/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import android.content.Context
import android.util.AttributeSet
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.settings

internal class ToolbarSimpleShortcutPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : ToolbarShortcutPreference(context, attrs) {

    override val options: List<ShortcutOption> = simpleShortcutOptions

    override fun readSelectedKey(): String? = context.settings().toolbarSimpleShortcutKey

    override fun writeSelectedKey(key: String) {
        context.settings().toolbarSimpleShortcutKey = key
    }

    override fun toolbarShortcutPreview(): Int = R.drawable.ic_toolbar_simple_shortcut_preview
}
