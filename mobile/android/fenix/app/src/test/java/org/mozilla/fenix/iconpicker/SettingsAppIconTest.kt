/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import junit.framework.TestCase.assertEquals
import org.junit.Test

class SettingsAppIconTest {

    @Test
    fun `GIVEN a valid AliasSuffix WHEN fromAliasSuffix is called THEN matching SettingsAppIcon is returned`() {
        val input = AliasSuffix.AppGradientSunset

        val result = SettingsAppIcon.fromAliasSuffix(input)

        assertEquals(SettingsAppIcon.appGradientSunset, result)
    }

    @Test
    fun `GIVEN an unknown AliasSuffix WHEN fromAliasSuffix is called THEN appDefault is returned`() {
        val unknownAliasSuffix = AliasSuffix.Unknown

        val result = SettingsAppIcon.fromAliasSuffix(unknownAliasSuffix)

        assertEquals(SettingsAppIcon.appDefault, result)
    }
}
