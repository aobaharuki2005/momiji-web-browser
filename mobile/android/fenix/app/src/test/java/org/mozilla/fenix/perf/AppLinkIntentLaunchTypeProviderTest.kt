/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Activity
import android.app.Application
import androidx.test.core.app.ApplicationProvider
import mozilla.components.concept.engine.EngineSession
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppLinkIntentLaunchTypeProviderTest {

    private lateinit var app: Application

    @Before
    fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        AppLinkIntentLaunchTypeProvider.resetForTests()
        AppLinkIntentLaunchTypeProvider.register(app)
    }

    @Test
    fun `classify as COLD before any activity is created`() {
        // No activities created yet
        assertEquals(EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_COLD, AppLinkIntentLaunchTypeProvider.getExternalIntentLaunchType(Activity::class.java))
    }

    @Test
    fun `classify as WARM when the app was created before but no activity exists`() {
        // Create an activity and destroy it.
        val controller = Robolectric.buildActivity(Activity::class.java)
        controller.create().start().resume()
        controller.pause().stop().destroy()

        // App is created, but no activity exists. It is no longer a cold start.
        assertEquals(EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_WARM, AppLinkIntentLaunchTypeProvider.getExternalIntentLaunchType(Activity::class.java))
    }

    @Test
    fun `classify as HOT when the app was created before and the activity already exists`() {
        // Create an activity.
        val controller = Robolectric.buildActivity(Activity::class.java)
        controller.create().start().resume()

        // App is created, and the activity exists. It is no longer a warm start.
        assertEquals(EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_HOT, AppLinkIntentLaunchTypeProvider.getExternalIntentLaunchType(Activity::class.java))
    }
}
