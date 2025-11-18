/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import org.junit.Assert.assertEquals
import org.junit.Test

class AppIconReducerTest {
   @Test
   fun `GIVEN Selected user action WHEN reducer is called THEN state is updated with the selected icon`() {
       val initialState = AppIconState()
       val newIcon = AppIcon.AppRetro2004

       assertEquals(null, initialState.userSelectedAppIcon)

       val result = appIconReducer(initialState, UserAction.Selected(newIcon))

       assertEquals(newIcon, result.userSelectedAppIcon)
   }

    @Test
    fun `GIVEN Selected user action WHEN reducer is called THEN the current icon is not changed`() {
        val initialState = AppIconState()
        val newIcon = AppIcon.AppRetro2004

        assertEquals(AppIcon.AppDefault, initialState.currentAppIcon)

        val result = appIconReducer(initialState, UserAction.Selected(newIcon))

        assertEquals(AppIcon.AppDefault, result.currentAppIcon)
    }

    @Test
    fun `GIVEN Dismissed user action WHEN reducer is called THEN state resets the user selected icon to null`() {
        val initialState = AppIconState(userSelectedAppIcon = AppIcon.AppRetro2004)

        assertEquals(AppIcon.AppRetro2004, initialState.userSelectedAppIcon)

        val result = appIconReducer(initialState, UserAction.Dismissed)

        assertEquals(null, result.userSelectedAppIcon)
    }

    @Test
    fun `GIVEN Dismissed user action WHEN reducer is called THEN the current icon is not changed`() {
        val initialState = AppIconState()

        assertEquals(AppIcon.AppDefault, initialState.currentAppIcon)

        val result = appIconReducer(initialState, UserAction.Dismissed)

        assertEquals(AppIcon.AppDefault, result.currentAppIcon)
    }

    @Test
    fun `GIVEN Applied user action WHEN reducer is called THEN the new icon becomes the new current and the user selected icon resets to null`() {
        val newIcon = AppIcon.AppRetro2004
        val currentIcon = AppIcon.AppDefault
        val initialState = AppIconState(
            currentAppIcon = currentIcon,
            userSelectedAppIcon = newIcon,
        )

        assertEquals(currentIcon, initialState.currentAppIcon)
        assertEquals(newIcon, initialState.userSelectedAppIcon)

        val result = appIconReducer(initialState, SystemAction.Applied(newIcon = newIcon))

        assertEquals(newIcon, result.currentAppIcon)
        assertEquals(null, result.userSelectedAppIcon)
    }
}
