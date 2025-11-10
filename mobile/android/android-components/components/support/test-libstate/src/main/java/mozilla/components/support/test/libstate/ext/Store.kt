/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.test.libstate.ext

import mozilla.components.lib.state.Action
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store

/**
 * Blocks and returns once all dispatched actions have been processed
 * i.e. the reducers have run and all observers have been notified of
 * state changes.
 */
fun <S : State, A : Action> Store<S, A>.waitUntilIdle() {
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=1980348
    // this is no longer required and will be deleted later in the stack
}
