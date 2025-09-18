/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.ui.dialog

import android.content.res.Configuration
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material.AlertDialog
import androidx.compose.material.MaterialTheme
import androidx.compose.material.TextField
import androidx.compose.material.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.tooling.preview.Preview
import org.mozilla.focus.ui.theme.FocusTheme
import org.mozilla.focus.ui.theme.focusColors
import org.mozilla.focus.ui.theme.focusTypography

/**
 * Reusable composable for an alert dialog using [DialogButtonConfig] for buttons.
 *
 * @param dialogTitle Text displayed as the dialog title.
 * @param dialogTextComposable Optional composable for the dialog's main content area.
 * @param dialogText Text displayed in the dialog's main content area if [dialogTextComposable] is null.
 * @param onDismissRequest Action to perform when the dialog is dismissed
 *                         (e.g., by tapping outside or pressing the back button).
 * @param confirmButtonConfig Optional configuration for the confirm button. If null, the button is not shown.
 * @param dismissButtonConfig Optional configuration for the dismiss button. If null, the button is not shown.
 * @param dialogBackgroundColor Background color for the dialog. Defaults to `focusColors.secondary`.
 * @param dialogShape Shape for the dialog. Defaults to `MaterialTheme.shapes.medium`.
 */
@Composable
fun FocusDialog(
    dialogTitle: String,
    dialogTextComposable: @Composable (() -> Unit)? = null,
    dialogText: String = "",
    onDismissRequest: () -> Unit,
    confirmButtonConfig: DialogButtonConfig? = null,
    dismissButtonConfig: DialogButtonConfig? = null,
    dialogBackgroundColor: Color = focusColors.secondary,
    dialogShape: Shape = MaterialTheme.shapes.medium,
) {
    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { DialogTitle(text = dialogTitle) },
        text = dialogTextComposable ?: {
            if (dialogText.isNotEmpty()) {
                DialogText(text = dialogText)
            }
        },
        confirmButton = {
            confirmButtonConfig?.let { config ->
                if (config.visible) {
                    DialogTextButton(
                        text = config.text,
                        onClick = config.onClick,
                        enabled = config.enabled,
                    )
                }
            }
        },
        dismissButton = {
            dismissButtonConfig?.let { config ->
                if (config.visible) {
                    DialogTextButton(
                        text = config.text,
                        onClick = config.onClick,
                        enabled = config.enabled,
                    )
                }
            }
        },
        backgroundColor = dialogBackgroundColor,
        shape = dialogShape,
    )
}

/**
 * Data class representing the configuration for a dialog button.
 *
 * @property text The text to be displayed on the button.
 * @property onClick The lambda function to be executed when the button is clicked.
 * @property enabled A boolean indicating whether the button is enabled or not. Defaults to `true`.
 * @property visible A boolean indicating whether the button is visible or not. Defaults to `true`.
 */
data class DialogButtonConfig(
    val text: String,
    val onClick: () -> Unit,
    val enabled: Boolean = true,
    val visible: Boolean = true,
)

/**
 * Reusable composable for a dialog title.
 */
@Composable
fun DialogTitle(
    modifier: Modifier = Modifier,
    text: String,
) {
    Text(
        modifier = modifier,
        color = focusColors.onPrimary,
        text = text,
        style = focusTypography.dialogTitle,
    )
}

/**
 * Reusable composable for a dialog text.
 */
@Composable
fun DialogText(
    modifier: Modifier = Modifier,
    text: String,
) {
    Text(
        modifier = modifier,
        color = focusColors.onPrimary,
        text = text,
        style = focusTypography.dialogInput,
    )
}

/**
 * Reusable composable for a dialog button with text.
 */
@Composable
fun DialogTextButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = MaterialTheme.shapes.large,
    ) {
        Text(
            modifier = modifier,
            color = if (enabled) {
                focusColors.dialogActiveControls
            } else {
                focusColors.dialogActiveControls.copy(alpha = 0.5f)
            },
            text = text,
            style = MaterialTheme.typography.button,
        )
    }
}

/**
 * Reusable composable for a dialog input field.
 */
@Composable
fun DialogInputField(
    modifier: Modifier = Modifier,
    text: String,
    placeholder: @Composable () -> Unit,
    onValueChange: (String) -> Unit,
) {
    TextField(
        modifier = modifier
            .wrapContentHeight(),
        value = text,
        placeholder = placeholder,
        onValueChange = onValueChange,
        textStyle = focusTypography.dialogInput,
        colors = TextFieldDefaults.textFieldColors(
            backgroundColor = focusColors.secondary,
            textColor = focusColors.onSecondary,
            cursorColor = focusColors.onPrimary,
            focusedIndicatorColor = focusColors.dialogActiveControls,
            unfocusedIndicatorColor = focusColors.dialogActiveControls,
        ),
        singleLine = true,
        shape = MaterialTheme.shapes.large,
    )
}

@Preview(
    name = "dark theme",
    showBackground = true,
    backgroundColor = 0xFF393473,
    uiMode = Configuration.UI_MODE_NIGHT_MASK,
)
@Composable
private fun DialogTitlePreviewDark() {
    FocusTheme {
        FocusDialogSample()
    }
}

@Preview(
    name = "light theme",
    showBackground = true,
    backgroundColor = 0xFFFBFBFE,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Composable
private fun DialogTitlePreviewLight() {
    FocusTheme {
        FocusDialogSample()
    }
}

@Composable
private fun FocusDialogSample() {
    FocusDialog(
        dialogTitle = "Sample dialog",
        dialogText = "Sample dialog text using DialogButtonConfig.",
        onDismissRequest = { /* Preview: Dialog dismissed (e.g. tap outside) */ },
        confirmButtonConfig = DialogButtonConfig(
            text = "CONFIRM",
            onClick = { /* Preview: Confirm clicked */ },
        ),
        dismissButtonConfig = DialogButtonConfig(
            text = "CANCEL",
            onClick = { /* Preview: Cancel clicked */ },
            enabled = true,
        ),
    )
}
