/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner

/**
 * A custom [AndroidJUnitRunner] test instrumentation runner that forces the use of
 * [AndroidTestFenixApplication] for all instrumentation tests.
 */
class FenixTestRunner : AndroidJUnitRunner() {
    override fun newApplication(
        cl: ClassLoader?,
        className: String?,
        context: Context?,
    ): Application {
        // We ignore the className provided by the manifest and explicitly use our test application.
        return super.newApplication(cl, AndroidTestFenixApplication::class.java.name, context)
    }
}
