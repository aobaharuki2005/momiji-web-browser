/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.iconpicker

import org.mozilla.fenix.utils.Settings

/**
 * An interface for accessing available and selected app icon options, as well as persisting the
 * selected one.
 */
interface SettingsAppIconRepository {
    /**
     * The icon selected by the user or the default one.
     */
    var selectedAppIcon: SettingsAppIcon

    /**
     * Icons available for the user to choose from.
     */
    val groupedAppIcons: Map<SettingsGroupTitle, List<SettingsAppIcon>>
}

/**
 * Default implementation of the [SettingsAppIconRepository]
 *
 * @param settings The settings object used to persist the selected icon.
 */
class DefaultSettingsAppIconRepository(
    private val settings: Settings,
) : SettingsAppIconRepository {
    override var selectedAppIcon: SettingsAppIcon
        get() = SettingsAppIcon.fromAliasSuffix(AliasSuffix.fromString(settings.selectedAppIcon))
        set(value) { settings.selectedAppIcon = value.activityAlias.aliasSuffix.suffix }

    override val groupedAppIcons: Map<SettingsGroupTitle, List<SettingsAppIcon>>
        get() = SettingsAppIcon.groupedAppIcons
}
