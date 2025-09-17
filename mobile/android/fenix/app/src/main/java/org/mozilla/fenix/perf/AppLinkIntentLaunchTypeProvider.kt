/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.annotation.VisibleForTesting
import mozilla.components.concept.engine.EngineSession
import org.mozilla.fenix.android.DefaultActivityLifecycleCallbacks
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Tracks and provides the type of the [Application] instance's launch.
 * See [EngineSession.LoadUrlFlags] for more details about the types.
 *
 * [register] must be called for this object to work correctly.
 *
 * This class relies on specific lifecycle method call orders for the app process and the activities.
 */
object AppLinkIntentLaunchTypeProvider {
    private val hasAnyActivityBeenCreated = AtomicBoolean(false)
    private val liveActivityCounts = ConcurrentHashMap<Class<out Activity>, AtomicInteger>()

    /**
     * Registers the handlers needed by this object: this is expected to be called from
     * [Application.onCreate].
     */
    fun register(app: Application) {
        app.registerActivityLifecycleCallbacks(
            object : DefaultActivityLifecycleCallbacks {
                override fun onActivityCreated(activity: Activity, bundle: Bundle?) {
                    hasAnyActivityBeenCreated.compareAndSet(false, true)
                    liveActivityCounts.getOrPut(activity.javaClass) { AtomicInteger(0) }.incrementAndGet()
                }

                override fun onActivityDestroyed(activity: Activity) {
                    super.onActivityDestroyed(activity)
                    liveActivityCounts[activity.javaClass]?.updateAndGet { count -> maxOf(0, count - 1) }
                }
            },
        )
    }

    /**
     * Classifies an external intent launch type at the moment it arrives.
     *
     * COLD -> when the application and the activity are created from scratch.
     *
     * WARM -> when the application process is alive but the activity is created from scratch.
     *
     * HOT -> when the application process is alive and an existing instance of the target activity
     * is reused (no new activity instance is created).
     *
     */
    fun getExternalIntentLaunchType(target: Class<*>?): Int = when {
        !hasAnyActivityBeenCreated.get() -> EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_COLD
        (liveActivityCounts[target]?.get() ?: 0) > 0 ->
            EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_HOT
        else -> EngineSession.LoadUrlFlags.APP_LINK_LAUNCH_TYPE_WARM
    }

    @VisibleForTesting
    internal fun resetForTests() {
        hasAnyActivityBeenCreated.set(false)
    }
}
