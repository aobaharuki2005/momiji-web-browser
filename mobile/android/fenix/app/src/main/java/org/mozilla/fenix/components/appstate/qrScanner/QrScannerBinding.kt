/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.appstate.qrScanner

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.components.appstate.AppState

/**
 * Binding class for the QR Scanner feature to the [AppStore].
 *
 * @property appStore [AppStore] to read state dispatches from.
 * @param qrScannerDelegate [QrScannerDelegate] for managing behavior of the QR Scanner.
 */
class QrScannerBinding(
    val appStore: AppStore,
    private val qrScannerDelegate: QrScannerDelegate,
) : AbstractBinding<AppState>(appStore) {
    override suspend fun onState(flow: Flow<AppState>) {
        flow.distinctUntilChangedBy { state -> state.qrScannerState.isRequesting }
            .collect {
                if (it.qrScannerState.isRequesting) {
                    appStore.dispatch(AppAction.QrScannerAction.QrScannerRequestConsumed)
                    qrScannerDelegate.launchQrScanner()
                }
            }
    }
}
