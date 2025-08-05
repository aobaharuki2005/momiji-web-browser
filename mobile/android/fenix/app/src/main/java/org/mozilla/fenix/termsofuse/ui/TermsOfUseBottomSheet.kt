/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptAction
import org.mozilla.fenix.termsofuse.store.TermsOfUsePromptStore
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * The terms of service prompt
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TermsOfUseBottomSheet(
    store: TermsOfUsePromptStore,
    onDismiss: () -> Unit = {},
) {
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
    )

    LaunchedEffect(Unit) {
        sheetState.show()
    }

    BottomSheet(
        store = store,
        sheetState = sheetState,
        onDismiss = onDismiss,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BottomSheet(
    store: TermsOfUsePromptStore,
    sheetState: SheetState,
    onDismiss: () -> Unit = {},
) {
    ModalBottomSheet(
        onDismissRequest = {
            store.dispatch(TermsOfUsePromptAction.OnPromptManuallyDismissed)
            onDismiss()
        },
        sheetState = sheetState,
    ) {
        BottomSheetContent()
    }
}

@Composable
private fun BottomSheetContent() {
    Column { }
}

@OptIn(ExperimentalMaterial3Api::class)
@FlexibleWindowLightDarkPreview
@Composable
private fun TermsOfUseBottomSheetPreview() {
    val density = LocalDensity.current
    val sheetState = remember {
        SheetState(
            initialValue = SheetValue.Expanded,
            density = density,
            skipPartiallyExpanded = false,
        )
    }

    FirefoxTheme {
        BottomSheet(
            store = TermsOfUsePromptStore(
                middleware = emptyList(),
            ),
            sheetState = sheetState,
        )
    }
}
