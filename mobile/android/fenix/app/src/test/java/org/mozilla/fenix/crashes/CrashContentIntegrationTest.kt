/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import android.content.res.Configuration
import android.view.ViewGroup.MarginLayoutParams
import androidx.fragment.app.Fragment
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.CrashAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.toolbar.BrowserToolbar
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.Components
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.OrientationMode
import org.mozilla.fenix.ext.getBottomToolbarHeight
import org.mozilla.fenix.ext.getTopToolbarHeight
import org.mozilla.fenix.utils.Settings

@RunWith(AndroidJUnit4::class)
class CrashContentIntegrationTest {

    private val sessionId = "sessionId"
    private lateinit var browserStore: BrowserStore
    private lateinit var appStore: AppStore
    private lateinit var settings: Settings
    private lateinit var fragment: Fragment
    private lateinit var testDispatcher: TestDispatcher

    @Suppress("NoStaticMocking") // https://bugzilla.mozilla.org/show_bug.cgi?id=1988538
    @Before
    fun setup() {
        testDispatcher = StandardTestDispatcher()
        browserStore = BrowserStore(
            BrowserState(
                tabs = listOf(
                    createTab("url", id = sessionId),
                ),
                selectedTabId = sessionId,
            ),
        )
        appStore = AppStore()
        settings = mockk(relaxed = true)
        fragment = mockk(relaxed = true)

        mockkStatic(Fragment::getBottomToolbarHeight)
        mockkStatic(Fragment::getTopToolbarHeight)
        every { fragment.getBottomToolbarHeight(any()) } returns 100
        every { fragment.getTopToolbarHeight(any()) } returns 100
    }

    @Test
    fun `GIVEN a tab WHEN its content crashes THEN expand the toolbar and show the in-content crash reporter`() = runTest(testDispatcher) {
        val crashReporterLayoutParams: MarginLayoutParams = mockk(relaxed = true)
        val crashReporterView: CrashContentView = mockk(relaxed = true) {
            every { layoutParams } returns crashReporterLayoutParams
        }
        val toolbar: BrowserToolbar = mockk(relaxed = true) {
            every { height } returns 33
        }
        val components: Components = mockk()
        val integration = CrashContentIntegration(
            fragment = fragment,
            browserStore = browserStore,
            appStore = appStore,
            toolbar = toolbar,
            components = components,
            settings = settings,
            navController = mockk(),
            customTabSessionId = sessionId,
            dispatcher = testDispatcher,
        )
        val controllerCaptor = slot<CrashReporterController>()
        integration.viewProvider = { crashReporterView }
        integration.start()
        browserStore.dispatch(CrashAction.SessionCrashedAction(sessionId))
        testScheduler.advanceUntilIdle()

        verify {
            toolbar.expand()
            crashReporterLayoutParams.topMargin = 33
            crashReporterView.show(capture(controllerCaptor))
        }
        assertEquals(sessionId, controllerCaptor.captured.sessionId)
        assertEquals(components, controllerCaptor.captured.components)
        assertEquals(settings, controllerCaptor.captured.settings)
        assertEquals(appStore, controllerCaptor.captured.appStore)
    }

    @Test
    fun `GIVEN a tab is marked as crashed WHEN the crashed state changes THEN hide the in-content crash reporter`() = runTest(testDispatcher) {
        val crashReporterLayoutParams: MarginLayoutParams = mockk(relaxed = true)
        val crashReporterView: CrashContentView = mockk(relaxed = true) {
            every { layoutParams } returns crashReporterLayoutParams
        }
        val integration = CrashContentIntegration(
            fragment = fragment,
            browserStore = browserStore,
            appStore = appStore,
            toolbar = mockk(),
            components = mockk(),
            settings = settings,
            navController = mockk(),
            customTabSessionId = sessionId,
            dispatcher = testDispatcher,
        )

        integration.viewProvider = { crashReporterView }
        integration.start()
        browserStore.dispatch(CrashAction.RestoreCrashedSessionAction(sessionId))
        testScheduler.advanceUntilIdle()

        verify { crashReporterView.hide() }
    }

    @Test
    fun `WHEN orientation state changes THEN margins are updated`() = runTest(testDispatcher) {
        val crashReporterLayoutParams: MarginLayoutParams = mockk(relaxed = true)
        val crashReporterView: CrashContentView = mockk(relaxed = true) {
            every { layoutParams } returns crashReporterLayoutParams
        }
        val integration = spyk(
            CrashContentIntegration(
                fragment = fragment,
                browserStore = browserStore,
                appStore = appStore,
                toolbar = mockk(),
                components = mockk(),
                settings = settings,
                navController = mockk(),
                customTabSessionId = sessionId,
                dispatcher = testDispatcher,
            ),
        )

        integration.viewProvider = { crashReporterView }
        integration.start()
        appStore.dispatch(AppAction.OrientationChange(orientation = OrientationMode.fromInteger(Configuration.ORIENTATION_LANDSCAPE)))
        testScheduler.advanceUntilIdle()

        verify { integration.updateVerticalMargins() }
    }

    @OptIn(ExperimentalCoroutinesApi::class) // advanceUntilIdle
    @Test
    fun `GIVEN integration was stopped and then restarted WHEN orientation state changes THEN margins are updated`() = runTest(testDispatcher) {
        val crashReporterLayoutParams: MarginLayoutParams = mockk(relaxed = true)
        val crashReporterView: CrashContentView = mockk(relaxed = true) {
            every { layoutParams } returns crashReporterLayoutParams
        }
        // Use a new dispatcher for the second start if we want to isolate its coroutines
        // or simply rely on the single testDispatcher if that's sufficient for the test logic.
        // For this test, simply re-using testDispatcher should be fine as the stop() cancels the previous scope.
        val integration = spyk(
            CrashContentIntegration(
                fragment = fragment,
                browserStore = browserStore,
                appStore = appStore,
                toolbar = mockk(),
                components = mockk(),
                settings = settings,
                navController = mockk(),
                customTabSessionId = sessionId,
                dispatcher = testDispatcher, // First dispatcher
            ),
        )

        integration.viewProvider = { crashReporterView }
        integration.start()
        integration.stop()

        // To truly test a restart with a new scope, one might inject a new dispatcher here.
        // However, the existing dispatcher will be used by the new scope created in start().
        integration.viewProvider = { crashReporterView }
        integration.start() // This will create a new scope with the *original* testDispatcher

        appStore.dispatch(AppAction.OrientationChange(orientation = OrientationMode.fromInteger(Configuration.ORIENTATION_LANDSCAPE)))
        testScheduler.advanceUntilIdle()

        verify { integration.updateVerticalMargins() }
    }

    @Test
    fun `GIVEN integration was stopped and then restarted without view provider THEN crash reporter view is not updated`() = runTest(testDispatcher) {
        val crashReporterLayoutParams: MarginLayoutParams = mockk(relaxed = true)
        val crashReporterView: CrashContentView = mockk(relaxed = true) {
            every { layoutParams } returns crashReporterLayoutParams
        }
        val toolbar: BrowserToolbar = mockk(relaxed = true) {
            every { height } returns 33
        }
        val components: Components = mockk()
        val integration = CrashContentIntegration(
            fragment = fragment,
            browserStore = browserStore,
            appStore = appStore,
            toolbar = toolbar,
            components = components,
            settings = settings,
            navController = mockk(),
            customTabSessionId = sessionId,
            dispatcher = testDispatcher,
        )
        val controllerCaptor = slot<CrashReporterController>()
        integration.viewProvider = { crashReporterView }
        integration.start()

        integration.stop() // viewProvider becomes null here
        integration.start() // Starts with a new scope, but viewProvider is null

        browserStore.dispatch(CrashAction.SessionCrashedAction(sessionId))
        testScheduler.advanceUntilIdle()

        verify(exactly = 0) {
            crashReporterView.show(capture(controllerCaptor))
        }
    }
}
