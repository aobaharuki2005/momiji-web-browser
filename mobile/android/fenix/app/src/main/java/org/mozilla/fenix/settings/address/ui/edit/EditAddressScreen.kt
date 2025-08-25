/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalMaterial3Api::class)

package org.mozilla.fenix.settings.address.ui.edit

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Dropdown
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.DestructiveButton
import mozilla.components.compose.base.button.PrimaryButton
import mozilla.components.compose.base.button.SecondaryButton
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.compose.base.textfield.TextFieldColors
import mozilla.components.concept.storage.UpdatableAddressFields
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.settings.address.Country
import org.mozilla.fenix.settings.address.DEFAULT_COUNTRY
import org.mozilla.fenix.settings.address.store.AddressAction
import org.mozilla.fenix.settings.address.store.AddressState
import org.mozilla.fenix.settings.address.store.AddressStore
import org.mozilla.fenix.settings.address.store.CancelTapped
import org.mozilla.fenix.settings.address.store.DeleteTapped
import org.mozilla.fenix.settings.address.store.FormChange
import org.mozilla.fenix.settings.address.store.SaveTapped
import org.mozilla.fenix.settings.address.store.ViewAppeared
import org.mozilla.fenix.settings.address.store.isEditing
import org.mozilla.fenix.settings.address.store.selectedCountry
import org.mozilla.fenix.theme.FirefoxTheme
import kotlin.reflect.KProperty1
import mozilla.components.compose.base.text.Text as DropdownText

/**
 * The UI host for the Edit Address Screen.
 *
 * @param store the [AddressStore] used to power the screen.
 */
@Composable
fun EditAddressScreen(store: AddressStore) {
    Scaffold(
        topBar = {
            EditAddressTopBar(store)
        },
        containerColor = FirefoxTheme.colors.layer1,
    ) { paddingValues ->
        DeleteAddressDialog(store)

        val state by store.observeAsState(store.state) { it }
        val address = state.address

        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .padding(paddingValues)
                .padding(
                    horizontal = FirefoxTheme.layout.space.static200,
                    vertical = FirefoxTheme.layout.space.static100,
                )
                .verticalScroll(state = rememberScrollState()),
        ) {
            AddressField(labelId = R.string.addresses_name, value = address.name) {
                store.dispatch(FormChange.Name(it))
            }
            AddressField(labelId = R.string.addresses_street_address, value = address.streetAddress) {
                store.dispatch(FormChange.StreetAddress(it))
            }
            AddressField(labelId = R.string.addresses_city, value = address.addressLevel2) {
                store.dispatch(FormChange.City(it))
            }

            state.selectedCountry?.let { country ->
                SubregionDropdown(
                    subregionTitleResource = country.subregionTitleResource,
                    subregions = country.subregions,
                    currentSubregion = state.address.addressLevel1,
                    onSubregionChange = { store.dispatch(FormChange.SubRegion(it)) },
                )
            }

            AddressField(labelId = R.string.addresses_zip, value = address.postalCode) {
                store.dispatch(FormChange.PostalCode(it))
            }

            CountryDropdown(
                availableCountries = state.availableCountries,
                onCountryChange = { store.dispatch(FormChange.Country(it)) },
                currentCountry = state.address.country,
            )

            AddressField(labelId = R.string.addresses_phone, value = address.tel) {
                store.dispatch(FormChange.Phone(it))
            }
            AddressField(labelId = R.string.addresses_email, value = address.email) {
                store.dispatch(FormChange.Email(it))
            }

            FormButtons(store)
        }
    }
}

@Composable
private fun CountryDropdown(
    availableCountries: Map<String, Country>,
    onCountryChange: (String) -> Unit = {},
    currentCountry: String,
) {
    val countryList = availableCountries.map { (countryKey, countryValue) ->
        MenuItem.CheckableItem(DropdownText.String(countryValue.displayName), currentCountry == countryKey) {
            onCountryChange(countryKey)
        }
    }
    AddressDropdown(R.string.addresses_country, countryList)
}

@Composable
private fun SubregionDropdown(
    @StringRes subregionTitleResource: Int,
    subregions: List<String>,
    currentSubregion: String?,
    onSubregionChange: (String) -> Unit = {},
) {
    val countryList = subregions.map {
        MenuItem.CheckableItem(
            DropdownText.String(it),
            currentSubregion == it,
        ) {
            onSubregionChange(it)
        }
    }

    AddressDropdown(
        subregionTitleResource,
        countryList,
    )
}

@Composable
private fun FormButtons(store: AddressStore) {
    Row {
        if (store.state.isEditing) {
            DestructiveButton(text = stringResource(R.string.addressess_delete_address_button)) {
                store.dispatch(DeleteTapped)
            }
        }

        Spacer(Modifier.weight(1f))

        SecondaryButton(text = stringResource(R.string.addresses_cancel_button)) {
            store.dispatch(CancelTapped)
        }

        Spacer(Modifier.width(8.dp))

        PrimaryButton(text = stringResource(R.string.addresses_save_button)) {
            store.dispatch(SaveTapped)
        }
    }
}

@Composable
private fun AddressField(
    @StringRes labelId: Int,
    value: String,
    onChange: (String) -> Unit,
) {
    TextField(
        value = value,
        onValueChange = onChange,
        placeholder = "",
        errorText = "",
        label = stringResource(labelId),
        colors = TextFieldColors.default(
            placeholderColor = FirefoxTheme.colors.textPrimary,
        ),
    )
}

@Composable
private fun AddressDropdown(
    @StringRes labelId: Int,
    dropdownItems: List<MenuItem.CheckableItem>,
) {
    Dropdown(
        label = stringResource(labelId),
        placeholder = "",
        dropdownItems = dropdownItems,
    )
}

@FlexibleWindowLightDarkPreview
@Composable
private fun EditAddressPreview() {
    val store = AddressStore(AddressState.initial(), listOf()).also { it.dispatch(ViewAppeared) }
    FirefoxTheme {
        EditAddressScreen(store)
    }
}
