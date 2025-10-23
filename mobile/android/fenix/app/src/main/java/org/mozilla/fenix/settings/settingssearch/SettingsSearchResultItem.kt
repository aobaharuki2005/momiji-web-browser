/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Composable for the settings search result item.
 *
 * @param item [SettingsSearchItem] to display.
 * @param onClick Callback for when the item is clicked.
 */
@Composable
fun SettingsSearchResultItem(
    item: SettingsSearchItem,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
    ) {
        if (item.breadcrumbs.isNotEmpty()) {
            Text(
                text = item.breadcrumbs.joinToString(" > "),
                style = FirefoxTheme.typography.caption,
                color = FirefoxTheme.colors.textSecondary,
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        Text(
            text = item.title,
            style = FirefoxTheme.typography.subtitle1,
            color = FirefoxTheme.colors.textPrimary,
        )
        if (item.summary.isNotBlank()) {
            Text(
                text = item.summary,
                style = FirefoxTheme.typography.caption,
                color = FirefoxTheme.colors.textSecondary,
                modifier = Modifier.padding(top = 4.dp),
            )
        } else {
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

private class SettingsSearchResultItemParameterProvider : PreviewParameterProvider<SettingsSearchItem> {
    override val values: Sequence<SettingsSearchItem>
        get() = sequenceOf(
            SettingsSearchItem(
                title = "Search Engine",
                summary = "Set your preferred search engine for browsing.",
                preferenceKey = "search_engine_main",
                breadcrumbs = listOf("Search", "Default Search Engine"),
                preferenceFileInformation = PreferenceFileInformation.SearchSettingsPreferences,
            ),
            SettingsSearchItem(
                title = "Advanced Settings",
                summary = "", // Empty or blank summary
                preferenceKey = "advanced_stuff",
                breadcrumbs = listOf("Developer", "Experiments"),
                preferenceFileInformation = PreferenceFileInformation.GeneralPreferences,
            ),
        )
}

/**
 * Preview for the Settings Search Result Item.
 */
@PreviewLightDark
@Composable
private fun SettingsSearchResultItemFullPreview(
    @PreviewParameter(SettingsSearchResultItemParameterProvider::class) item: SettingsSearchItem,
) {
    FirefoxTheme {
        SettingsSearchResultItem(
            item = item,
            onClick = {},
        )
    }
}
