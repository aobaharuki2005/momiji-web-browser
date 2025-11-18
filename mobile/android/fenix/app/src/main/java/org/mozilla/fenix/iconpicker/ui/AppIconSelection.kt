/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.TextButton
import mozilla.components.compose.base.snackbar.Snackbar
import mozilla.components.compose.base.snackbar.displaySnackbar
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.button.RadioButton
import org.mozilla.fenix.iconpicker.AppIcon
import org.mozilla.fenix.iconpicker.AppIconSnackbarState
import org.mozilla.fenix.iconpicker.AppIconState
import org.mozilla.fenix.iconpicker.AppIconStore
import org.mozilla.fenix.iconpicker.AppIconWarningDialog
import org.mozilla.fenix.iconpicker.DefaultAppIconRepository
import org.mozilla.fenix.iconpicker.DefaultPackageManagerWrapper
import org.mozilla.fenix.iconpicker.IconBackground
import org.mozilla.fenix.iconpicker.IconGroupTitle
import org.mozilla.fenix.iconpicker.SystemAction
import org.mozilla.fenix.iconpicker.UserAction
import org.mozilla.fenix.theme.FirefoxTheme

private val ListItemHeight = 56.dp
private val AppIconSize = 40.dp
private val AppIconPadding = 6.dp
private val AppIconBorderWidth = 1.dp
private val AppIconCornerRadius = 4.dp
private val GroupHeaderHeight = 36.dp
private val GroupHeaderPaddingStart = 72.dp
private val GroupSpacerHeight = 8.dp

/**
 * A composable that displays a list of app icon options.
 *
 * @param store A store for managing the app icon selection screen state.
 */
@Composable
fun AppIconSelection(
    store: AppIconStore,
) {
    val state by store.observeAsState(store.state) { it }
    val selectedIcon = state.userSelectedAppIcon ?: state.currentAppIcon
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val errorSnackbarMessage = stringResource(R.string.shortcuts_update_error)
    LaunchedEffect(state.snackbarState) {
        when (state.snackbarState) {
            AppIconSnackbarState.None -> return@LaunchedEffect
            AppIconSnackbarState.ApplyingNewIconError -> scope.launch {
                snackbarHostState.displaySnackbar(
                    message = errorSnackbarMessage,
                    onDismissPerformed = {
                        store.dispatch(SystemAction.SnackbarDismissed)
                    },
                )
            }
        }
    }

    Scaffold(
        snackbarHost = {
            SnackbarHost(
                hostState = snackbarHostState,
                snackbar = { snackbarData ->
                    Snackbar(snackbarData = snackbarData)
                },
                modifier = Modifier.imePadding(),
            )
        },
        contentWindowInsets = WindowInsets(), // empty insets, activity toolbar is handled by the host fragment
    ) { paddingValues ->
        AppIconList(
            paddingValues = paddingValues,
            selectedIcon = selectedIcon,
            groupedIcons = state.groupedIconOptions,
            onIconSelected = { icon -> store.dispatch(UserAction.Selected(icon)) },
        )
    }

    when (val warning = state.warningDialogState) {
        is AppIconWarningDialog.Presenting -> RestartWarningDialog(
            onConfirmClicked = {
                store.dispatch(
                    UserAction.Confirmed(
                        oldIcon = state.currentAppIcon,
                        newIcon = warning.newIcon,
                    ),
                )
            },
            onDismissClicked = {
                store.dispatch(UserAction.Dismissed)
            },
            onDismissed = {
                store.dispatch(SystemAction.DialogDismissed)
            },
        )
        else -> Unit
    }
}

@Composable
private fun AppIconList(
    paddingValues: PaddingValues,
    selectedIcon: AppIcon,
    groupedIcons: Map<IconGroupTitle, List<AppIcon>>,
    onIconSelected: (AppIcon) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .padding(paddingValues)
            .background(color = FirefoxTheme.colors.layer1),
    ) {
        groupedIcons.forEach { (header, icons) ->
            item(contentType = { header::class }) {
                AppIconGroupHeader(header)
            }

            items(
                items = icons,
                contentType = { item -> item::class },
            ) { icon ->
                val iconSelected = icon == selectedIcon

                AppIconOption(
                    appIcon = icon,
                    selected = iconSelected,
                    onClick = {
                        if (!iconSelected) {
                            onIconSelected(icon)
                        }
                    },
                )
            }

            item {
                Spacer(modifier = Modifier.height(GroupSpacerHeight))

                HorizontalDivider(color = FirefoxTheme.colors.borderPrimary)
            }
        }
    }
}

@Composable
private fun AppIconGroupHeader(title: IconGroupTitle) {
    Text(
        text = stringResource(id = title.titleId),
        modifier = Modifier
            .height(GroupHeaderHeight)
            .padding(start = GroupHeaderPaddingStart)
            .wrapContentHeight(Alignment.CenterVertically)
            .semantics { heading() },
        style = FirefoxTheme.typography.headline8,
        color = MaterialTheme.colorScheme.tertiary,
    )
}

@Composable
private fun AppIconOption(
    appIcon: AppIcon,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(ListItemHeight)
            .selectable(
                selected = selected,
                role = Role.RadioButton,
                onClick = { onClick() },
            )
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = {
                onClick()
            },
            modifier = Modifier.clearAndSetSemantics {},
        )

        AppIcon(appIcon)

        Spacer(modifier = Modifier.width(16.dp))

        Column {
            Text(
                text = stringResource(appIcon.titleId),
                style = FirefoxTheme.typography.subtitle1,
                color = FirefoxTheme.colors.textPrimary,
            )

            appIcon.subtitleId?.let {
                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = stringResource(it),
                    style = FirefoxTheme.typography.body2,
                    color = FirefoxTheme.colors.textSecondary,
                )
            }
        }
    }
}

/**
 * Renders a preview of the app’s launcher icon similarly to how it will drawn by the users's launcher.
 */
@Composable
fun AppIcon(
    appIcon: AppIcon,
    iconSize: Dp = AppIconSize,
    borderWidth: Dp = AppIconBorderWidth,
    cornerRadius: Dp = AppIconCornerRadius,
) {
    val roundedShape = RoundedCornerShape(cornerRadius)
    // Spacing the background to make up for inconsistency between box and background clippings.
    // If unchanged, the background will spill over the border; if adjusted by the border width,
    // the background won't exactly reach the border. Pixel hunting.
    val backgroundPadding = borderWidth / 2

    Box(
        modifier = Modifier
            .size(iconSize)
            .border(
                width = borderWidth,
                color = FirefoxTheme.colors.borderPrimary,
                shape = roundedShape,
            )
            .padding(backgroundPadding)
            .clip(roundedShape),
    ) {
        when (val background = appIcon.iconBackground) {
            is IconBackground.Color -> {
                Box(
                    modifier = Modifier
                        .size(iconSize)
                        .background(colorResource(id = background.colorResId)),
                )
            }

            is IconBackground.Drawable -> {
                Image(
                    painter = painterResource(id = background.drawableResId),
                    contentDescription = null,
                    modifier = Modifier.size(iconSize),
                )
            }
        }

        Image(
            painter = painterResource(id = appIcon.iconForegroundId),
            contentDescription = null,
            modifier = Modifier
                .size(iconSize)
                .padding(AppIconPadding),
        )
    }
}

@Composable
private fun RestartWarningDialog(
    onConfirmClicked: () -> Unit,
    onDismissClicked: () -> Unit,
    onDismissed: () -> Unit,
) {
    AlertDialog(
        title = {
            Text(
                text = stringResource(R.string.restart_warning_dialog_title),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.headline7,
            )
                },
        text = {
            Text(
                text = stringResource(
                    id = R.string.restart_warning_dialog_body_2,
                    stringResource(R.string.app_name),
                ),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.body2,
            )
        },
        onDismissRequest = { onDismissed() },
        confirmButton = {
            TextButton(
                text = stringResource(id = R.string.restart_warning_dialog_button_positive_2),
                onClick = { onConfirmClicked() },
            )
        },
        dismissButton = {
            TextButton(
                text = stringResource(id = R.string.restart_warning_dialog_button_negative),
                onClick = { onDismissClicked() },
            )
        },
    )
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconSelectionPreview() {
    FirefoxTheme {
        AppIconSelection(
            store = AppIconStore(
                initialState = AppIconState(
                    currentAppIcon = AppIcon.AppDefault,
                    userSelectedAppIcon = null,
                    groupedIconOptions = DefaultAppIconRepository(
                        packageManager = DefaultPackageManagerWrapper(LocalContext.current.packageManager),
                        packageName = LocalContext.current.packageName,
                    ).groupedAppIcons,
                ),
            ),
        )
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconOptionPreview() {
    FirefoxTheme {
        AppIconOption(AppIcon.AppDefault, false) {}
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun AppIconOptionWithSubtitlePreview() {
    FirefoxTheme {
        AppIconOption(AppIcon.AppMomo, false) {}
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun RestartWarningDialogPreview() {
    FirefoxTheme {
        RestartWarningDialog(
            onConfirmClicked = {},
            onDismissClicked = {},
            onDismissed = {},
        )
    }
}
