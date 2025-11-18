/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.support.test.ext.joinBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AppIconMiddlewareTest {

    @Test
    fun `WHEN the store receives UserAction Confirmed THEN the middleware calls the updateAppIcon interface with the correct data from the action`() {
        val currentIcon = AppIcon.AppDefault
        val newIcon = AppIcon.AppRetro2004
        var updatedCurrentIcon: AppIcon? = null
        var updatedNewIcon: AppIcon? = null
        val middleware = AppIconMiddleware { newIcon, currentIcon ->
            updatedNewIcon = newIcon
            updatedCurrentIcon = currentIcon
            true
        }
        val store = AppIconStore(
           initialState = AppIconState(
               currentAppIcon = currentIcon,
               userSelectedAppIcon = null,
               groupedIconOptions = mapOf(),
           ),
            middleware = listOf(middleware),
        )

        store.dispatch(UserAction.Confirmed(newIcon = newIcon, oldIcon = currentIcon)).joinBlocking()

        assertEquals(currentIcon, updatedCurrentIcon)
        assertEquals(newIcon, updatedNewIcon)
    }

    @Test
    fun `WHEN updateAppIcon call is successful THEN the middleware dispatches the Applied system action to the store`() {
        val currentIcon = AppIcon.AppDefault
        val newIcon = AppIcon.AppRetro2004
        val middleware = AppIconMiddleware { newIcon, currentIcon -> true }
        val result = mutableListOf<AppIconAction>()
        val store = AppIconStore(
            initialState = AppIconState(
                currentAppIcon = currentIcon,
            ),
            reducer = { state, action ->
                result.add(action)
                state
            },
            middleware = listOf(middleware),
        )

        assertTrue(result.isEmpty())

        val confirmAction = UserAction.Confirmed(newIcon = newIcon, oldIcon = currentIcon)
        store.dispatch(confirmAction).joinBlocking()

        assertEquals(listOf(confirmAction, SystemAction.Applied(newIcon)), result)
    }

    @Test
    fun `WHEN updateAppIcon call returns with an a failure THEN the middleware dispatches the UpdateFailed system action to the store`() {
        val currentIcon = AppIcon.AppDefault
        val newIcon = AppIcon.AppRetro2004
        val middleware = AppIconMiddleware { newIcon, currentIcon -> false }
        val result = mutableListOf<AppIconAction>()
        val store = AppIconStore(
            initialState = AppIconState(
                currentAppIcon = currentIcon,
            ),
            reducer = { state, action ->
                result.add(action)
                state
            },
            middleware = listOf(middleware),
        )

        assertTrue(result.isEmpty())

        val confirmAction = UserAction.Confirmed(newIcon = newIcon, oldIcon = currentIcon)
        store.dispatch(confirmAction).joinBlocking()

        assertEquals(listOf(confirmAction, SystemAction.UpdateFailed), result)
    }

    @Test
    fun `GIVEN EnvironmentRehydrated system action WHEN middleware is called THEN the new app icon updater replaces the old one`() {
        val initialUpdater = AppIconUpdater { _, _ -> false }
        val middleware = AppIconMiddleware(initialUpdater)
        val store = AppIconStore(
            initialState = AppIconState(),
            reducer = { state, action ->
                state
            },
            middleware = listOf(middleware),
        )
        val newUpdater = AppIconUpdater { _, _ -> false }

        store.dispatch(SystemAction.EnvironmentRehydrated(newUpdater)).joinBlocking()

        assertEquals(newUpdater, middleware.updateAppIcon)
    }
}
