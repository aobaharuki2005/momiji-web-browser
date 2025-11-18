/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.ext.joinBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppIconMiddlewareTest {

    @Test
    fun `WHEN the store receives an ApplyAppIcon action THEN the middleware calls the updateAppIcon interface with the correct data from the action`() {
        val currentIcon = AppIcon.AppDefault
        val newIcon = AppIcon.AppRetro2004
        var updatedCurrentIcon: AppIcon? = null
        var updatedNewIcon: AppIcon? = null
        val middleware = AppIconMiddleware { newIcon, currentIcon ->
            updatedNewIcon = newIcon
            updatedCurrentIcon = currentIcon
        }
        val store = AppIconStore(
           initialState = AppIconState(
               currentAppIcon = currentIcon,
               userSelectedAppIcon = null,
               groupedIconOptions = mapOf(),
           ),
            middleware = listOf(middleware),
        )

        store.dispatch(AppIconAction.ApplyAppIcon(newIcon = newIcon, currentIcon = currentIcon)).joinBlocking()

        assertEquals(currentIcon, updatedCurrentIcon)
        assertEquals(newIcon, updatedNewIcon)
    }
}
