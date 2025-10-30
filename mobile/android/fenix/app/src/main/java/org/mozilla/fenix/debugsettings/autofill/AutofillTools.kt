/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.debugsettings.autofill

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import org.mozilla.fenix.R
import org.mozilla.fenix.compose.list.TextListItem
import org.mozilla.fenix.debugsettings.store.DebugDrawerAction
import org.mozilla.fenix.debugsettings.store.DebugDrawerStore
import org.mozilla.fenix.theme.FirefoxTheme

@Composable
internal fun AutofillTools(
    debugDrawerStore: DebugDrawerStore,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        TextListItem(
            label = stringResource(id = R.string.debug_drawer_logins_title),
            onClick = {
                debugDrawerStore.dispatch(DebugDrawerAction.NavigateTo.Logins)
            },
        )

        HorizontalDivider()

        TextListItem(
            label = stringResource(id = R.string.debug_drawer_addresses_title),
            onClick = {
                debugDrawerStore.dispatch(DebugDrawerAction.NavigateTo.Addresses)
            },
        )

        HorizontalDivider()

        TextListItem(
            label = stringResource(id = R.string.debug_drawer_credit_cards_title),
            onClick = {
                debugDrawerStore.dispatch(DebugDrawerAction.NavigateTo.CreditCards)
            },
        )

        HorizontalDivider()
    }
}

@FlexibleWindowLightDarkPreview
@Composable
internal fun AutofillToolsPreview() {
    FirefoxTheme {
        AutofillTools(
            debugDrawerStore = DebugDrawerStore(),
            modifier = Modifier.background(MaterialTheme.colorScheme.surface),
        )
    }
}
