/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix

/**
 * Custom [DebugFenixApplication] for the `androidTest` builds. Allows for custom configurations
 * in automated UI tests. This class extends [DebugFenixApplication] which is the default build
 * variant used in automated UI tests.
 */
class AndroidTestFenixApplication : DebugFenixApplication() {

    override fun isRunningInTestEnvironment(): Boolean = true
}
