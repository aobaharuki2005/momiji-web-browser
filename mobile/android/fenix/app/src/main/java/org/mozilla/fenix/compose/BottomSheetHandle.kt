/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.compose

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * A handle present on top of a bottom sheet. This is selectable when talkback is enabled.
 *
 * @param onRequestDismiss Invoked on clicking the handle when talkback is enabled.
 * @param contentDescription Content Description of the composable.
 * @param modifier The modifier to be applied to the Composable.
 * @param color Color of the handle.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BottomSheetHandle(
    onRequestDismiss: () -> Unit,
    contentDescription: String,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.outline,
) {
    BottomSheetDefaults.DragHandle(
        modifier = modifier.semantics(mergeDescendants = true) {
            role = Role.Button
            this.contentDescription = contentDescription
            onClick {
                onRequestDismiss()
                true
            }
        },
        color = color,
    )
}

@Composable
@PreviewLightDark
private fun BottomSheetHandlePreview() {
    FirefoxTheme {
        Surface {
            Column(
                modifier = Modifier.padding(16.dp),
            ) {
                BottomSheetHandle(
                    onRequestDismiss = {},
                    contentDescription = "",
                )
            }
        }
    }
}
