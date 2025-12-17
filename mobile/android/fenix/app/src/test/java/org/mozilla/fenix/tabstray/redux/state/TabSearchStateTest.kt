/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.tabstray.redux.state

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TabSearchStateTest {

    @Test
    fun `WHEN TabSearchState is created with defaults THEN values are empty and not loading`() {
        val state = TabSearchState()

        assertEquals("", state.query)
        assertTrue(state.searchResults.isEmpty())
    }
}
