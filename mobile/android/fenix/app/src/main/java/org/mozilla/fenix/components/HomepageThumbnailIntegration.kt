/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components

import android.content.Context
import android.graphics.Canvas
import android.view.View
import androidx.core.graphics.createBitmap
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.browser.thumbnails.HomepageThumbnails
import mozilla.components.browser.thumbnails.RequestHomepageScreenshot
import mozilla.components.support.base.feature.LifecycleAwareFeature
import org.mozilla.fenix.components.usecases.FenixBrowserUseCases.Companion.ABOUT_HOME

/**
 * HomeFragment delegate to take screenshot of homepage when view loads and display as a thumbnail in tabstray.

 * @param context A [Context] used to check for low memory.
 * @param view The [View] to take screenshot of.
 * @param store The [BrowserStore] used to look up the current selected tab.
 */
class HomepageThumbnailIntegration(
    private val context: Context,
    private val view: View,
    private val store: BrowserStore,
) : LifecycleAwareFeature {
    private val feature by lazy { HomepageThumbnails(context, store, ABOUT_HOME, ::homepageRequest) }

    override fun start() {
        feature.start()
    }

    override fun stop() {
        feature.stop()
    }

    private fun homepageRequest(requestHomepageScreenshot: RequestHomepageScreenshot) {
        view.post {
            val bitmap = createBitmap(view.width, view.height)
            val canvas = Canvas(bitmap)
            view.draw(canvas)
            requestHomepageScreenshot(bitmap)
        }
    }
}
