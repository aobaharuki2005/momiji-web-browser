/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import org.junit.Assert.assertEquals
import org.junit.Test

class AppIconReducerTest {
   @Test
   fun `GIVEN SelectAppIcon action WHEN reducer is called THEN state is updated with the selected icon`() {
       val initialState = AppIconState()
       val newIcon = AppIcon.AppRetro2004

       assertEquals(null, initialState.userSelectedAppIcon)

       val result = appIconReducer(initialState, AppIconAction.SelectAppIcon(newIcon))

       assertEquals(newIcon, result.userSelectedAppIcon)
   }

    @Test
    fun `GIVEN SelectAppIcon action WHEN reducer is called THEN the current icon is not changed`() {
        val initialState = AppIconState()
        val newIcon = AppIcon.AppRetro2004

        assertEquals(AppIcon.AppDefault, initialState.currentAppIcon)

        val result = appIconReducer(initialState, AppIconAction.SelectAppIcon(newIcon))

        assertEquals(AppIcon.AppDefault, result.currentAppIcon)
    }

    @Test
    fun `GIVEN ResetSelection action WHEN reducer is called THEN state resets the user selected icon to null`() {
        val initialState = AppIconState(userSelectedAppIcon = AppIcon.AppRetro2004)

        assertEquals(AppIcon.AppRetro2004, initialState.userSelectedAppIcon)

        val result = appIconReducer(initialState, AppIconAction.ResetSelection)

        assertEquals(null, result.userSelectedAppIcon)
    }

    @Test
    fun `GIVEN ResetSelection action WHEN reducer is called THEN the current icon is not changed`() {
        val initialState = AppIconState()

        assertEquals(AppIcon.AppDefault, initialState.currentAppIcon)

        val result = appIconReducer(initialState, AppIconAction.ResetSelection)

        assertEquals(AppIcon.AppDefault, result.currentAppIcon)
    }

    @Test
    fun `GIVEN ApplyAppIcon action WHEN reducer is called THEN the new icon becomes the new current and user selected icon resets`() {
        val newIcon = AppIcon.AppRetro2004
        val currentIcon = AppIcon.AppDefault
        val initialState = AppIconState(
            currentAppIcon = currentIcon,
            userSelectedAppIcon = newIcon,
        )

        assertEquals(currentIcon, initialState.currentAppIcon)
        assertEquals(newIcon, initialState.userSelectedAppIcon)

        val result = appIconReducer(initialState, AppIconAction.ApplyAppIcon(newIcon = newIcon, currentIcon = currentIcon))

        assertEquals(newIcon, result.currentAppIcon)
        assertEquals(null, result.userSelectedAppIcon)
    }
}
