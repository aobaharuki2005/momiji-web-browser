/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowNotificationManager
import org.robolectric.shadows.ShadowService

@RunWith(RobolectricTestRunner::class)
class ProfilerServiceTest {

    private lateinit var context: Context
    private lateinit var notificationManager: NotificationManager
    private lateinit var shadowNotificationManager: ShadowNotificationManager
    private lateinit var serviceController: ServiceController<ProfilerService>
    private lateinit var service: ProfilerService
    private lateinit var shadowService: ShadowService

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        shadowNotificationManager = Shadows.shadowOf(notificationManager)

        serviceController = Robolectric.buildService(ProfilerService::class.java)
        serviceController.create()
        service = serviceController.get()
        shadowService = Shadows.shadowOf(service)
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.O])
    fun `GIVEN SDK is O+ WHEN service is created THEN notification channel is created`() {
        val createdChannels = shadowNotificationManager.notificationChannels
        val channel = createdChannels.find { it.id == ProfilerService.PROFILING_CHANNEL_ID }

        assertNotNull(
            "Channel with ID '${ProfilerService.PROFILING_CHANNEL_ID}' should be created on Oreo+",
            channel,
        )
        assertEquals("Channel ID mismatch", ProfilerService.PROFILING_CHANNEL_ID, channel?.id)
        assertEquals("Channel name mismatch", "App Profiling Status", channel?.name.toString())
        assertEquals("Channel importance mismatch", NotificationManager.IMPORTANCE_DEFAULT, channel?.importance)
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.N_MR1])
    fun `GIVEN SDK is below O WHEN service is created THEN no notification channel is created`() {
        assertTrue(
            "Notification channel list should be empty below Oreo",
            shadowNotificationManager.notificationChannels.isEmpty(),
        )
    }

    @Test
    fun `WHEN onStartCommand receives START action THEN service starts foreground and posts notification`() {
        val startIntent = Intent(context, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_START_PROFILING
        }

        service.onStartCommand(startIntent, 0, 1)

        val postedNotification: Notification? = shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID)
        assertNotNull("Notification should be posted after start action", postedNotification)

        val shadowNotification = Shadows.shadowOf(postedNotification)
        assertEquals("Notification title mismatch", "Profiler Running", shadowNotification.contentTitle.toString())
        assertEquals("Notification text mismatch", "Profiling is active.", shadowNotification.contentText.toString())
        assertNotEquals("FLAG_ONGOING_EVENT should be set", 0, postedNotification!!.flags and Notification.FLAG_ONGOING_EVENT)
        assertNotEquals("FLAG_FOREGROUND_SERVICE should be set", 0, postedNotification.flags and Notification.FLAG_FOREGROUND_SERVICE)

        assertFalse("Service should not be foreground-stopped after start", shadowService.isForegroundStopped)
    }

    @Test
    fun `GIVEN profiler service is running WHEN onStartCommand receives 'stop action' THEN the profiler service stops`() {
        val startIntent = Intent(context, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_START_PROFILING
        }
        service.onStartCommand(startIntent, 0, 1)
        assertNotNull(
            "Notification should be present after starting",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )

        val stopIntent = Intent(context, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_STOP_PROFILING
        }

        service.onStartCommand(stopIntent, 0, 2)

        assertNull(
            "Notification should be removed after stop action",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )
        assertTrue("Service should be foreground-stopped after stop action", shadowService.isForegroundStopped)
        assertTrue("Service should be self-stopped after stop action", shadowService.isStoppedBySelf)
    }

    @Test
    fun `GIVEN the profiler service is running WHEN onStartCommand receives an unknown action THEN the profiler service stops`() {
        val startIntent = Intent(context, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_START_PROFILING
        }
        service.onStartCommand(startIntent, 0, 1)
        assertNotNull(
            "Notification should be present after starting",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )

        val unknownIntent = Intent(context, ProfilerService::class.java).apply {
            action = "org.mozilla.fenix.perf.RANDOM"
        }

        service.onStartCommand(unknownIntent, 0, 2)

        assertNull(
            "Notification should be removed after unknown action",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )
        assertTrue("Service should be foreground-stopped after unknown action", shadowService.isForegroundStopped)
        assertTrue("Service should be self-stopped after unknown action", shadowService.isStoppedBySelf)
    }

    @Test
    fun `GIVEN the profiler service is running WHEN onStartCommand receives a null action THEN the profiler service stops`() {
        val startIntent = Intent(context, ProfilerService::class.java).apply {
            action = ProfilerService.ACTION_START_PROFILING
        }
        service.onStartCommand(startIntent, 0, 1)
        assertNotNull(
            "Notification should be present after starting",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )

        val nullActionIntent = Intent(context, ProfilerService::class.java)

        service.onStartCommand(nullActionIntent, 0, 2)

        assertNull(
            "Notification should be removed after null action",
            shadowNotificationManager.getNotification(ProfilerService.PROFILING_NOTIFICATION_ID),
        )
        assertTrue("Service should be foreground-stopped after null action", shadowService.isForegroundStopped)
        assertTrue("Service should be self-stopped after null action", shadowService.isStoppedBySelf)
    }
}
