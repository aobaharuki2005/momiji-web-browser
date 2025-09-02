/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import mozilla.components.support.utils.ext.stopForegroundCompat
import org.mozilla.fenix.R

/**
 * A foreground service that manages profiling notifications in the Firefox Android app.
 *
 * This service displays a persistent notification when profiling is active and provides
 * a way for users to stop profiling through the notification. The service
 * handles starting and stopping profiling operations based on intents.
 *
 * The service creates a notification channel for profiling-related notifications and
 * maintains a foreground service while profiling is active to ensure the profiling
 * process continues even when the app is in the background.
 *
 * @see StopProfilerActivity The activity launched when the user taps the notification
 */
class ProfilerService : Service() {

    /**
     * Companion object containing constants and static functionality for the ProfilerService.
     * This object defines the intent actions that can be sent to the service to control
     * profiling operations.
     */
    companion object {
        const val ACTION_START_PROFILING = "mozilla.perf.action.START_PROFILING"
        const val ACTION_STOP_PROFILING = "mozilla.perf.action.STOP_PROFILING"
        const val PROFILING_CHANNEL_ID = "mozilla.perf.profiling"
        const val PROFILING_NOTIFICATION_ID = 99
        private const val REQUEST_CODE = 3
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_PROFILING -> {
                val notification = createNotification()
                startForeground(PROFILING_NOTIFICATION_ID, notification)
            }
            ACTION_STOP_PROFILING -> {
                stopForegroundCompat()
                stopSelf()
            }
            else -> {
                stopForegroundCompat()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForegroundCompat(true)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val profilingChannel = NotificationChannel(
                PROFILING_CHANNEL_ID,
                "App Profiling Status",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Shows when app profiling is active"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }
            val notificationManager: NotificationManager =
                getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(profilingChannel)
        }
    }

    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, StopProfilerActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            REQUEST_CODE,
            notificationIntent,
            pendingIntentFlags,
        )

        return NotificationCompat.Builder(this, PROFILING_CHANNEL_ID)
            .setContentTitle("Profiler Running")
            .setContentText("Profiling is active.")
            .setSmallIcon(R.drawable.ic_profiler)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()
    }
    override fun onBind(p0: Intent?): IBinder? {
        return null
    }
}
