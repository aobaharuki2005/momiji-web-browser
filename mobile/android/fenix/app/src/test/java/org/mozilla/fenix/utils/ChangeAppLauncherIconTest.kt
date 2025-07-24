/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.utils

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.pm.ShortcutInfoCompat
import mozilla.components.support.test.any
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations.openMocks
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChangeAppLauncherIconTest {

    @Mock
    private lateinit var shortcutWrapper: ShortcutManagerWrapper
    private lateinit var shortcutInfoWrapper: ShortcutInfoWrapper

    @Before
    fun setup() {
        openMocks(this)
        shortcutInfoWrapper = ShortcutInfoWrapperDefault(testContext)
    }

    @Test
    fun `WHEN reset to default and user has default icon set THEN changeAppLauncherIcon makes no changes`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            true,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        verifyNoInteractions(shortcutWrapper)
    }

    @Test
    fun `WHEN reset to default and user has alternative icon set THEN changeAppLauncherIcon resets states to default config`() {
        val testShortcutManagerWrapper = TestShortcutManagerWrapper(testContext)
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )

        val shortcut = createShortcut(alternativeAppAlias)
        testShortcutManagerWrapper.testPinnedShortcuts = listOf(shortcut)

        assertFalse(testShortcutManagerWrapper.getPinnedShortcutsEvoked)
        assertTrue(testShortcutManagerWrapper.updateShortcutsCapture.isEmpty())

        changeAppLauncherIcon(
            testContext,
            testShortcutManagerWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            true,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)

        val alternativeAppAliasState = packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)

        assertTrue(testShortcutManagerWrapper.getPinnedShortcutsEvoked)

        val updatedShortcut = testShortcutManagerWrapper.updateShortcutsCapture.first()
        assertEquals(shortcut.shortLabel, updatedShortcut.shortLabel)
        assertEquals(shortcut.intent, updatedShortcut.intent)
        assertEquals(appAlias, updatedShortcut.activity)
    }

    @Test
    fun `WHEN should reset to default icon and getPinnedShortcuts throws THEN changeAppLauncherIcon makes no changes to shortcuts and components are the original state`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )

        `when`(shortcutWrapper.getPinnedShortcuts()).thenThrow(IllegalStateException())

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            true,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        verify(shortcutWrapper).getPinnedShortcuts()
        verify(shortcutWrapper, never()).updateShortcuts(any())
    }

    @Test
    fun `WHEN should reset to default icon and updateShortcuts throws THEN changeAppLauncherIcon makes no changes to shortcuts and components are the original state`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )

        `when`(shortcutWrapper.updateShortcuts(any())).thenThrow(IllegalArgumentException())

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            true,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        verify(shortcutWrapper).getPinnedShortcuts()
        verify(shortcutWrapper).updateShortcuts(any())
    }

    @Test
    fun `WHEN use alternative icon and user has default icon set THEN changeAppLauncherIcon updates states to alternative config`() {
        val testShortcutManagerWrapper = TestShortcutManagerWrapper(testContext)
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )

        val shortcut = createShortcut(appAlias)
        testShortcutManagerWrapper.testPinnedShortcuts = listOf(shortcut)

        assertFalse(testShortcutManagerWrapper.getPinnedShortcutsEvoked)
        assertTrue(testShortcutManagerWrapper.updateShortcutsCapture.isEmpty())

        changeAppLauncherIcon(
            testContext,
            testShortcutManagerWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            false,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        assertTrue(testShortcutManagerWrapper.getPinnedShortcutsEvoked)

        val updatedShortcut = testShortcutManagerWrapper.updateShortcutsCapture.first()
        assertEquals(shortcut.shortLabel, updatedShortcut.shortLabel)
        assertEquals(shortcut.intent, updatedShortcut.intent)
        assertEquals(alternativeAppAlias, updatedShortcut.activity)
    }

    @Test
    fun `WHEN use alternative and user has alternative icon already set THEN changeAppLauncherIcon makes no changes`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )

        `when`(shortcutWrapper.getPinnedShortcuts()).thenReturn(mock())

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            false,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        verifyNoInteractions(shortcutWrapper)
    }

    @Test
    fun `WHEN should use alternative icon and getPinnedShortcuts throws THEN changeAppLauncherIcon makes no changes to shortcuts and components are the original state`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )

        `when`(shortcutWrapper.getPinnedShortcuts()).thenThrow(IllegalStateException())

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            false,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        verify(shortcutWrapper).getPinnedShortcuts()
        verify(shortcutWrapper, never()).updateShortcuts(any())
    }

    @Test
    fun `WHEN should use alternative icon and updateShortcuts throws THEN changeAppLauncherIcon makes no changes to shortcuts and components are the original state`() {
        val packageManager = testContext.packageManager
        val appAlias = ComponentName("test", "App")
        packageManager.setComponentEnabledSetting(
            appAlias,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        val alternativeAppAlias = ComponentName("test", "AppAlternative")
        packageManager.setComponentEnabledSetting(
            alternativeAppAlias,
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )

        `when`(shortcutWrapper.updateShortcuts(any())).thenThrow(IllegalArgumentException())

        changeAppLauncherIcon(
            testContext,
            shortcutWrapper,
            shortcutInfoWrapper,
            appAlias,
            alternativeAppAlias,
            false,
        )

        val appAliasState = packageManager.getComponentEnabledSetting(appAlias)
        assertTrue(appAliasState == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)

        val alternativeAppAliasState =
            packageManager.getComponentEnabledSetting(alternativeAppAlias)
        assertTrue(alternativeAppAliasState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED)

        verify(shortcutWrapper).getPinnedShortcuts()
        verify(shortcutWrapper).updateShortcuts(any())
    }
}

private fun createShortcut(componentName: ComponentName) =
    ShortcutInfoCompat.Builder(testContext, "1")
        .setShortLabel("1")
        .setIntent(Intent().apply { action = "TEST_ACTION" })
        .setActivity(componentName)
        .build()

private class TestShortcutManagerWrapper(context: Context) : ShortcutManagerWrapper {
    val defaultImplementation = ShortcutManagerWrapperDefault(context)
    var testPinnedShortcuts: List<ShortcutInfoCompat> = emptyList()
    var updateShortcutsCapture: List<ShortcutInfoCompat> = emptyList()
    var getPinnedShortcutsEvoked = false

    override fun getPinnedShortcuts(): List<ShortcutInfoCompat> {
        getPinnedShortcutsEvoked = true
        return testPinnedShortcuts
    }

    override fun updateShortcuts(updatedShortcuts: List<ShortcutInfoCompat>) {
        defaultImplementation.updateShortcuts(updatedShortcuts)
        this.updateShortcutsCapture = updatedShortcuts
    }
}
