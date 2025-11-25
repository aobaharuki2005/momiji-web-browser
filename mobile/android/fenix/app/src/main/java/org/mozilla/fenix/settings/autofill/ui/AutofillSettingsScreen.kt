/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.autofill.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.IconButton
import mozilla.components.lib.state.ext.observeAsState
import mozilla.components.service.fxa.manager.FxaAccountManager
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.list.IconListItem
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.ui.icons.R as iconsR

private const val WEIGHT_TEXT = 5f
private const val WEIGHT_SWITCH = 2f

@Composable
internal fun AutofillSettingsScreen(
    buildStore: (NavHostController) -> AutofillSettingsStore,
    accountManager: FxaAccountManager?,
    isAddressSyncEnabled: Boolean,
) {
    val navController = rememberNavController()
    val store = buildStore(navController)

    DisposableEffect(Unit) {
        val authenticated = accountManager?.authenticatedAccount() != null
        val needsReauthentication = accountManager?.accountNeedsReauth() == true

        when {
            needsReauthentication -> {
                store.dispatch(AccountAuthenticationAction.Failed)
            }
            authenticated -> {
                store.dispatch(AccountAuthenticationAction.Authenticated)
            }
            !authenticated -> {
                store.dispatch(AccountAuthenticationAction.NotAuthenticated)
            }
        }

        onDispose {
            store.dispatch(ViewDisposed)
        }
    }

    Scaffold(
        topBar = {
            AutofillSettingsTopBar(store)
        },
        containerColor = FirefoxTheme.colors.layer1,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .fillMaxWidth(),
        ) {
            Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))
            AutofillSettingsAddressSection(store, isAddressSyncEnabled)

            // delimiter line between sections
            HorizontalDivider(
                modifier = Modifier.padding(
                    start = 4.dp,
                    end = 4.dp,
                    top = 16.dp,
                    bottom = 16.dp,
                ),
                color = FirefoxTheme.colors.indicatorInactive, thickness = 0.3.dp,
            )

            AutofillSettingsCreditCardSection(store)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AutofillSettingsTopBar(store: AutofillSettingsStore) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = FirefoxTheme.colors.layer1),
        windowInsets = WindowInsets(
            top = 0.dp,
            bottom = 0.dp,
        ),
        title = {
            Text(
                text = stringResource(R.string.preferences_autofill),
                color = FirefoxTheme.colors.textPrimary,
                style = FirefoxTheme.typography.headline6,
            )
        },
        navigationIcon = {
            IconButton(
                modifier = Modifier
                    .padding(horizontal = FirefoxTheme.layout.space.static50),
                onClick = { store.dispatch(AutofillSettingsBackClicked) },
                contentDescription = stringResource(
                    R.string.autofill_settings_navigate_back_button_content_description,
                ),
            ) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_back_24),
                    contentDescription = null,
                    tint = FirefoxTheme.colors.iconPrimary,
                )
            }
        },
    )
}

@Composable
private fun AutofillSettingsAddressSection(
    store: AutofillSettingsStore,
    isAddressSyncEnabled: Boolean,
) {
    val state by store.observeAsState(store.state) { it }

    AddSectionLabel(label = stringResource(id = R.string.preferences_addresses))
    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))
    SaveFillSwitch(
        title = stringResource(id = R.string.preferences_addresses_save_and_autofill_addresses_2),
        label = stringResource(id = R.string.preferences_addresses_save_and_autofill_addresses_summary_2),
        isChecked = state.saveFillAddresses,
        onStateChange = { store.dispatch(ChangeAddressSaveFillPreference(!state.saveFillAddresses)) },
    )
    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static100))

    if (isAddressSyncEnabled) {
        if (state.accountAuthState == AccountAuthState.Authenticated) {
            SyncAcrossDevicesForAuthenticatedAccount(
                text = stringResource(id = R.string.preferences_addresses_sync_addresses),
                isChecked = state.syncAddresses,
                onSyncStateChange = { store.dispatch(UpdateAddressesSyncStatus(!state.syncAddresses)) },
            )
        } else {
            SyncAcrossDevicesForNotAuthenticatedAccount(
                text = stringResource(id = R.string.preferences_addresses_sync_addresses_across_devices),
                onClick = { store.dispatch(SyncAddressesAcrossDevicesClicked) },
            )
        }
    }

    if (state.addresses.isEmpty()) {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static100))

        AddItem(
            label = stringResource(R.string.preferences_addresses_add_address),
            onAddItemClicked = { store.dispatch(AddAddressClicked) },
        )
    } else {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))

        ManageItem(
            text = stringResource(id = R.string.preferences_addresses_manage_addresses),
            onClick = { store.dispatch(ManageAddressesClicked) },
        )
    }
}

@Composable
private fun AutofillSettingsCreditCardSection(store: AutofillSettingsStore) {
    val state by store.observeAsState(store.state) { it }

    AddSectionLabel(label = stringResource(id = R.string.preferences_credit_cards_2))
    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static200))
    SaveFillSwitch(
        title = stringResource(id = R.string.preferences_credit_cards_save_and_autofill_cards_2),
        label = stringResource(
            id = R.string.preferences_credit_cards_save_and_autofill_cards_summary_2,
            stringResource(id = R.string.app_name),
        ),
        isChecked = state.saveFillCards,
        onStateChange = { store.dispatch(ChangeCardSaveFillPreference(!state.saveFillCards)) },
    )
    Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static100))

    if (state.accountAuthState == AccountAuthState.Authenticated) {
        SyncAcrossDevicesForAuthenticatedAccount(
            text = stringResource(id = R.string.preferences_credit_cards_sync_cards),
            isChecked = state.syncCreditCards,
            onSyncStateChange = { store.dispatch(UpdateCreditCardsSyncStatus(!state.syncCreditCards)) },
        )
    } else {
        SyncAcrossDevicesForNotAuthenticatedAccount(
            text = stringResource(id = R.string.preferences_credit_cards_sync_cards_across_devices),
            onClick = { store.dispatch(SyncCardsAcrossDevicesClicked) },
        )
    }

    if (state.creditCards.isEmpty()) {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static100))

        AddItem(
            label = stringResource(R.string.credit_cards_add_card),
            onAddItemClicked = { store.dispatch(AddCardClicked) },
        )
    } else {
        Spacer(modifier = Modifier.height(FirefoxTheme.layout.space.static150))
        ManageItem(
            text = stringResource(id = R.string.preferences_credit_cards_manage_saved_cards_2),
            onClick = { store.dispatch(ManageCreditCardsClicked) },
        )
    }
}

@Composable
private fun AddSectionLabel(label: String) {
    Text(
        text = label,
        modifier = Modifier.padding(start = FirefoxTheme.layout.space.static200),
        style = FirefoxTheme.typography.headline8,
        color = MaterialTheme.colorScheme.tertiary,
    )
}

@Composable
private fun SaveFillSwitch(
    title: String,
    label: String,
    isChecked: Boolean,
    onStateChange: (Boolean) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Text(
        text = title,
        modifier = Modifier.padding(start = FirefoxTheme.layout.space.static400),
        style = FirefoxTheme.typography.body1,
        color = FirefoxTheme.colors.textPrimary,
    )

    Row(
        modifier = Modifier
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Switch,
                onClick = {
                    onStateChange(!isChecked)
                },
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        horizontalArrangement = Arrangement.Absolute.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier
                .padding(start = FirefoxTheme.layout.space.static500)
                .weight(WEIGHT_TEXT),
            maxLines = 2,
            style = FirefoxTheme.typography.body2,
            color = FirefoxTheme.colors.textSecondary,
        )

        Switch(
            checked = isChecked,
            modifier = Modifier.weight(WEIGHT_SWITCH),
            onCheckedChange = {
                onStateChange(it)
            },
        )
    }
}

@Composable
private fun SyncAcrossDevicesForAuthenticatedAccount(
    text: String,
    isChecked: Boolean,
    onSyncStateChange: (Boolean) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Switch,
                onClick = {
                    onSyncStateChange(!isChecked)
                },
            )
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        horizontalArrangement = Arrangement.Absolute.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            modifier = Modifier
                .padding(start = FirefoxTheme.layout.space.static400)
                .weight(WEIGHT_TEXT),
            maxLines = 2,
            style = FirefoxTheme.typography.body1,
            color = FirefoxTheme.colors.textPrimary,
        )

        Switch(
            checked = isChecked,
            modifier = Modifier.weight(WEIGHT_SWITCH),
            onCheckedChange = {
                onSyncStateChange(it)
            },
        )
    }
}

@Composable
private fun SyncAcrossDevicesForNotAuthenticatedAccount(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        modifier = Modifier
            .padding(start = FirefoxTheme.layout.space.static400)
            .clickable(onClick = onClick),
        style = FirefoxTheme.typography.body1,
        color = FirefoxTheme.colors.textPrimary,
    )
}

@Composable
private fun AddItem(
    label: String,
    onAddItemClicked: () -> Unit,
) {
    IconListItem(
        label = label,
        modifier = Modifier
            .padding(start = 10.dp)
            .width(FirefoxTheme.layout.size.containerMaxWidth),
        beforeIconPainter = painterResource(iconsR.drawable.mozac_ic_plus_24),
        onClick = { onAddItemClicked() },
    )
}

@Composable
private fun ManageItem(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        modifier = Modifier
            .padding(start = FirefoxTheme.layout.space.static400)
            .clickable(onClick = onClick),
        style = FirefoxTheme.typography.body1,
        color = FirefoxTheme.colors.textPrimary,
    )
}

@Composable
@FlexibleWindowLightDarkPreview
private fun AutofillSettingsScreenPreview() {
    val store = { _: NavHostController ->
        AutofillSettingsStore(
            initialState = AutofillSettingsState.default,
        )
    }
    FirefoxTheme {
        Box(modifier = Modifier.background(color = FirefoxTheme.colors.layer1)) {
            AutofillSettingsScreen(store, null, true)
        }
    }
}
