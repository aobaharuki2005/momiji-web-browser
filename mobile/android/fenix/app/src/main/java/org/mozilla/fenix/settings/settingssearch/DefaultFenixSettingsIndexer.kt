/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.settingssearch

/**
 * Indexes Settings preferences for the Settings Search screen.
 */
class DefaultFenixSettingsIndexer : SettingsIndexer {
    private val settings: MutableList<SettingsSearchItem> = mutableListOf()

    /**
     * Index all settings.
     */
    override fun indexAllSettings() {
        settings.clear()
        // index settings
    }

    /**
     * Get settings filtered by query.
     *
     * @param query Query [String] to filter by.
     * @return List of [SettingsSearchItem]s that match the query.
     */
    override fun getSettingsWithQuery(query: String): List<SettingsSearchItem> {
        if (query.isBlank()) return emptyList()

        return settings.filter { item ->
            item.title.contains(query, ignoreCase = true) ||
                    item.summary.contains(query, ignoreCase = true)
        }.toList()
    }
}
