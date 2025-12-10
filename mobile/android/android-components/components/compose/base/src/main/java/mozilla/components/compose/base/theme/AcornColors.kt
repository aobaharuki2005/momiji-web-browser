/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:Suppress("MagicNumber")

package mozilla.components.compose.base.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import mozilla.components.ui.colors.PhotonColors

/**
 * A custom Color Palette for Mozilla Firefox for Android (Fenix).
 */
@Suppress("LongParameterList")
@Stable
class AcornColors(
    layer2: Color,
    layer3: Color,
    layerAccent: Color,
    layerAccentNonOpaque: Color,
    layerScrim: Color,
    layerGradientStart: Color,
    layerGradientEnd: Color,
    layerWarning: Color,
    layerSuccess: Color,
    layerCritical: Color,
    layerInformation: Color,
    layerAutofillText: Color,
    actionSecondary: Color,
    actionWarning: Color,
    actionSuccess: Color,
    actionCritical: Color,
    actionInformation: Color,
    formDefault: Color,
    textSecondary: Color,
    textCritical: Color,
    textAccent: Color,
    textInverted: Color,
    textOnColorPrimary: Color,
    textActionSecondary: Color,
    iconPrimary: Color,
    iconPrimaryInactive: Color,
    iconSecondary: Color,
    iconActive: Color,
    iconOnColor: Color,
    iconOnColorDisabled: Color,
    iconActionPrimary: Color,
    borderAccent: Color,
    ripple: Color,
    tabActive: Color,
    tabInactive: Color,
    information: Color,
    surfaceDimVariant: Color,
) {
    // Layers

    // Card background, Menu background, Dialog, Banner
    var layer2 by mutableStateOf(layer2)
        private set

    // Search
    var layer3 by mutableStateOf(layer3)
        private set

    // App Bar Top (edit), Text Cursor, Selected Tab Check
    var layerAccent by mutableStateOf(layerAccent)
        private set

    // Selected tab
    var layerAccentNonOpaque by mutableStateOf(layerAccentNonOpaque)
        private set

    var layerScrim by mutableStateOf(layerScrim)
        private set

    // Tooltip
    var layerGradientStart by mutableStateOf(layerGradientStart)
        private set

    // Tooltip
    var layerGradientEnd by mutableStateOf(layerGradientEnd)
        private set

    // Warning background
    var layerWarning by mutableStateOf(layerWarning)
        private set

    // Confirmation background
    var layerSuccess by mutableStateOf(layerSuccess)
        private set

    // Error Background
    var layerCritical by mutableStateOf(layerCritical)
        private set

    // Info background
    var layerInformation by mutableStateOf(layerInformation)
        private set

    // Autofill text background
    // Use for the background of autofill text in the address bar.
    var layerAutofillText by mutableStateOf(layerAutofillText)
        private set

    // Actions

    // Secondary button
    var actionSecondary by mutableStateOf(actionSecondary)
        private set

    // Warning button
    var actionWarning by mutableStateOf(actionWarning)
        private set

    // Confirmation button
    var actionSuccess by mutableStateOf(actionSuccess)
        private set

    // Error button
    var actionCritical by mutableStateOf(actionCritical)
        private set

    // Info button
    var actionInformation by mutableStateOf(actionInformation)
        private set

    // Checkbox default, Radio button default
    var formDefault by mutableStateOf(formDefault)
        private set

    // Text

    // Secondary text
    var textSecondary by mutableStateOf(textSecondary)
        private set

    // Warning text
    var textCritical by mutableStateOf(textCritical)
        private set

    // Small heading, Text link
    var textAccent by mutableStateOf(textAccent)
        private set

    // Text Inverted
    var textInverted by mutableStateOf(textInverted)
        private set

    // Text Inverted/On Color
    var textOnColorPrimary by mutableStateOf(textOnColorPrimary)
        private set

    // Action Secondary text
    var textActionSecondary by mutableStateOf(textActionSecondary)
        private set

    // Icon

    // Primary icon
    var iconPrimary by mutableStateOf(iconPrimary)
        private set

    // Inactive tab
    var iconPrimaryInactive by mutableStateOf(iconPrimaryInactive)
        private set

    // Secondary icon
    var iconSecondary by mutableStateOf(iconSecondary)
        private set

    // Active tab
    var iconActive by mutableStateOf(iconActive)
        private set

    // Icon inverted (on color)
    var iconOnColor by mutableStateOf(iconOnColor)
        private set

    // Disabled icon inverted (on color)
    var iconOnColorDisabled by mutableStateOf(iconOnColorDisabled)
        private set

    // Action primary icon
    var iconActionPrimary by mutableStateOf(iconActionPrimary)
        private set

    // Border

    // Active tab (Nav), Selected tab, Active form
    var borderAccent by mutableStateOf(borderAccent)
        private set

    var ripple by mutableStateOf(ripple)
        private set

    // Tab Active
    var tabActive by mutableStateOf(tabActive)
        private set

    // Tab Inactive
    var tabInactive by mutableStateOf(tabInactive)
        private set

    /*
     * M3 color scheme extensions that do not have a mapped value from Acorn
     */

    /**
     * Attention-grabbing color against surface for fills, icons, and text,
     * indicating neutral information.
     */
    var information by mutableStateOf(information)
        private set

    /**
     * Surface Dim Variant
     *
     * Slightly dimmer surface color in light theme.
     */
    var surfaceDimVariant by mutableStateOf(surfaceDimVariant)
        private set

    /**
     * Updates the existing colors with the provided [AcornColors].
     */
    @Suppress("LongMethod")
    fun update(other: AcornColors) {
        layer2 = other.layer2
        layer3 = other.layer3
        layerAccent = other.layerAccent
        layerAccentNonOpaque = other.layerAccentNonOpaque
        layerScrim = other.layerScrim
        layerGradientStart = other.layerGradientStart
        layerGradientEnd = other.layerGradientEnd
        layerWarning = other.layerWarning
        layerSuccess = other.layerSuccess
        layerCritical = other.layerCritical
        layerInformation = other.layerInformation
        actionSecondary = other.actionSecondary
        actionWarning = other.actionWarning
        actionSuccess = other.actionSuccess
        actionCritical = other.actionCritical
        actionInformation = other.actionInformation
        formDefault = other.formDefault
        textSecondary = other.textSecondary
        textCritical = other.textCritical
        textAccent = other.textAccent
        textOnColorPrimary = other.textOnColorPrimary
        textActionSecondary = other.textActionSecondary
        iconPrimary = other.iconPrimary
        iconPrimaryInactive = other.iconPrimaryInactive
        iconSecondary = other.iconSecondary
        iconActive = other.iconActive
        iconOnColor = other.iconOnColor
        iconOnColorDisabled = other.iconOnColorDisabled
        iconActionPrimary = other.iconActionPrimary
        borderAccent = other.borderAccent
        ripple = other.ripple
        tabActive = other.tabActive
        tabInactive = other.tabInactive
        information = other.information
        surfaceDimVariant = other.surfaceDimVariant
    }

    /**
     * Return a copy of this [AcornColors] and optionally overriding any of the provided values.
     */
    @Suppress("LongMethod")
    fun copy(
        layer2: Color = this.layer2,
        layer3: Color = this.layer3,
        layerAccent: Color = this.layerAccent,
        layerAccentNonOpaque: Color = this.layerAccentNonOpaque,
        layerScrim: Color = this.layerScrim,
        layerGradientStart: Color = this.layerGradientStart,
        layerGradientEnd: Color = this.layerGradientEnd,
        layerWarning: Color = this.layerWarning,
        layerSuccess: Color = this.layerSuccess,
        layerCritical: Color = this.layerCritical,
        layerInformation: Color = this.layerInformation,
        layerAutofillText: Color = this.layerAutofillText,
        actionSecondary: Color = this.actionSecondary,
        actionWarning: Color = this.actionWarning,
        actionSuccess: Color = this.actionSuccess,
        actionCritical: Color = this.actionCritical,
        actionInformation: Color = this.actionInformation,
        formDefault: Color = this.formDefault,
        textSecondary: Color = this.textSecondary,
        textCritical: Color = this.textCritical,
        textAccent: Color = this.textAccent,
        textInverted: Color = this.textInverted,
        textOnColorPrimary: Color = this.textOnColorPrimary,
        textActionSecondary: Color = this.textActionSecondary,
        iconPrimary: Color = this.iconPrimary,
        iconPrimaryInactive: Color = this.iconPrimaryInactive,
        iconSecondary: Color = this.iconSecondary,
        iconActive: Color = this.iconActive,
        iconOnColor: Color = this.iconOnColor,
        iconOnColorDisabled: Color = this.iconOnColorDisabled,
        iconActionPrimary: Color = this.iconActionPrimary,
        borderAccent: Color = this.borderAccent,
        ripple: Color = this.ripple,
        tabActive: Color = this.tabActive,
        tabInactive: Color = this.tabInactive,
        information: Color = this.information,
        surfaceDimVariant: Color = this.surfaceDimVariant,
    ): AcornColors = AcornColors(
        layer2 = layer2,
        layer3 = layer3,
        layerAccent = layerAccent,
        layerAccentNonOpaque = layerAccentNonOpaque,
        layerScrim = layerScrim,
        layerGradientStart = layerGradientStart,
        layerGradientEnd = layerGradientEnd,
        layerWarning = layerWarning,
        layerSuccess = layerSuccess,
        layerCritical = layerCritical,
        layerInformation = layerInformation,
        layerAutofillText = layerAutofillText,
        actionSecondary = actionSecondary,
        actionWarning = actionWarning,
        actionSuccess = actionSuccess,
        actionCritical = actionCritical,
        actionInformation = actionInformation,
        formDefault = formDefault,
        textSecondary = textSecondary,
        textCritical = textCritical,
        textAccent = textAccent,
        textInverted = textInverted,
        textOnColorPrimary = textOnColorPrimary,
        textActionSecondary = textActionSecondary,
        iconPrimary = iconPrimary,
        iconPrimaryInactive = iconPrimaryInactive,
        iconSecondary = iconSecondary,
        iconActive = iconActive,
        iconOnColor = iconOnColor,
        iconOnColorDisabled = iconOnColorDisabled,
        iconActionPrimary = iconActionPrimary,
        borderAccent = borderAccent,
        ripple = ripple,
        tabActive = tabActive,
        tabInactive = tabInactive,
        information = information,
        surfaceDimVariant = surfaceDimVariant,
    )
}

val darkColorPalette = AcornColors(
    layer2 = PhotonColors.DarkGrey30,
    layer3 = PhotonColors.DarkGrey80,
    layerAccent = PhotonColors.Violet40,
    layerAccentNonOpaque = PhotonColors.Violet50A32,
    layerScrim = PhotonColors.DarkGrey90A95,
    layerGradientStart = PhotonColors.Violet70,
    layerGradientEnd = PhotonColors.Violet60,
    layerWarning = PhotonColors.Yellow70A77,
    layerSuccess = PhotonColors.Green80,
    layerCritical = PhotonColors.Pink80,
    layerInformation = PhotonColors.Blue50,
    layerAutofillText = PhotonColors.LightGrey05A34,
    actionSecondary = PhotonColors.DarkGrey05,
    actionWarning = PhotonColors.Yellow40A41,
    actionSuccess = PhotonColors.Green70,
    actionCritical = PhotonColors.Pink70A69,
    actionInformation = PhotonColors.Blue60,
    formDefault = PhotonColors.LightGrey05,
    textSecondary = PhotonColors.LightGrey40,
    textCritical = PhotonColors.Red20,
    textAccent = PhotonColors.Violet20,
    textInverted = PhotonColors.DarkGrey90,
    textOnColorPrimary = PhotonColors.LightGrey05,
    textActionSecondary = PhotonColors.LightGrey05,
    iconPrimary = PhotonColors.LightGrey05,
    iconPrimaryInactive = PhotonColors.LightGrey05A60,
    iconSecondary = PhotonColors.LightGrey40,
    iconActive = PhotonColors.Violet40,
    iconOnColor = PhotonColors.LightGrey05,
    iconOnColorDisabled = PhotonColors.LightGrey05A40,
    iconActionPrimary = PhotonColors.LightGrey05,
    borderAccent = PhotonColors.Violet40,
    ripple = PhotonColors.White,
    tabActive = PhotonColors.DarkGrey30,
    tabInactive = PhotonColors.DarkGrey80,
    information = PhotonColors.Blue30,
    surfaceDimVariant = PhotonColors.DarkGrey80,
)

val lightColorPalette = AcornColors(
    layer2 = PhotonColors.White,
    layer3 = PhotonColors.LightGrey20,
    layerAccent = PhotonColors.Ink20,
    layerAccentNonOpaque = PhotonColors.Violet70A12,
    layerScrim = PhotonColors.DarkGrey30A95,
    layerGradientStart = PhotonColors.Violet70,
    layerGradientEnd = PhotonColors.Violet60,
    layerWarning = PhotonColors.Yellow20,
    layerSuccess = PhotonColors.Green20,
    layerCritical = PhotonColors.Red10,
    layerInformation = PhotonColors.Blue50A44,
    layerAutofillText = PhotonColors.DarkGrey05A43,
    actionSecondary = PhotonColors.LightGrey30,
    actionWarning = PhotonColors.Yellow60A40,
    actionSuccess = PhotonColors.Green60,
    actionCritical = PhotonColors.Red30,
    actionInformation = PhotonColors.Blue50,
    formDefault = PhotonColors.DarkGrey90,
    textSecondary = PhotonColors.DarkGrey05,
    textCritical = PhotonColors.Red70,
    textAccent = PhotonColors.Violet70,
    textInverted = PhotonColors.LightGrey05,
    textOnColorPrimary = PhotonColors.LightGrey05,
    textActionSecondary = PhotonColors.DarkGrey90,
    iconPrimary = PhotonColors.DarkGrey90,
    iconPrimaryInactive = PhotonColors.DarkGrey90A60,
    iconSecondary = PhotonColors.DarkGrey05,
    iconActive = PhotonColors.Ink20,
    iconOnColor = PhotonColors.LightGrey05,
    iconOnColorDisabled = PhotonColors.LightGrey05A40,
    iconActionPrimary = PhotonColors.LightGrey05,
    borderAccent = PhotonColors.Ink20,
    ripple = PhotonColors.Black,
    tabActive = PhotonColors.LightGrey10,
    tabInactive = PhotonColors.LightGrey20,
    information = PhotonColors.Blue60,
    surfaceDimVariant = PhotonColors.LightGrey20,
)

val privateColorPalette = darkColorPalette.copy(
    layer2 = PhotonColors.Violet90,
    layer3 = PhotonColors.Ink90,
    layerAutofillText = PhotonColors.Violet60,
    tabActive = PhotonColors.Purple60,
    tabInactive = PhotonColors.Ink90,
    surfaceDimVariant = PhotonColors.Ink90,
)

@Suppress("LongParameterList")
private fun AcornColors.toM3ColorScheme(
    primary: Color,
    primaryContainer: Color,
    inversePrimary: Color,
    secondaryContainer: Color,
    tertiaryContainer: Color,
    surface: Color,
    onSurface: Color,
    inverseSurface: Color,
    errorContainer: Color,
    outline: Color,
    outlineVariant: Color,
    surfaceBright: Color,
    surfaceDim: Color,
    surfaceContainer: Color,
    surfaceContainerHigh: Color,
    surfaceContainerHighest: Color,
    surfaceContainerLow: Color,
    surfaceContainerLowest: Color,
): ColorScheme = ColorScheme(
    primary = primary,
    onPrimary = textInverted,
    primaryContainer = primaryContainer,
    onPrimaryContainer = onSurface,
    inversePrimary = inversePrimary,
    secondary = textSecondary,
    onSecondary = textInverted,
    secondaryContainer = secondaryContainer,
    onSecondaryContainer = onSurface,
    tertiary = textAccent,
    onTertiary = textInverted,
    tertiaryContainer = tertiaryContainer,
    onTertiaryContainer = onSurface,
    background = surface,
    onBackground = onSurface,
    surface = surface,
    onSurface = onSurface,
    surfaceVariant = surfaceContainerHighest,
    onSurfaceVariant = textSecondary,
    surfaceTint = layerAutofillText,
    inverseSurface = inverseSurface,
    inverseOnSurface = textInverted,
    error = textCritical,
    onError = textInverted,
    errorContainer = errorContainer,
    onErrorContainer = onSurface,
    outline = outline,
    outlineVariant = outlineVariant,
    scrim = layerScrim,
    surfaceBright = surfaceBright,
    surfaceDim = surfaceDim,
    surfaceContainer = surfaceContainer,
    surfaceContainerHigh = surfaceContainerHigh,
    surfaceContainerHighest = surfaceContainerHighest,
    surfaceContainerLow = surfaceContainerLow,
    surfaceContainerLowest = surfaceContainerLowest,
    primaryFixed = PhotonColors.Violet05,
    primaryFixedDim = primaryContainer,
    onPrimaryFixed = PhotonColors.DarkGrey90,
    onPrimaryFixedVariant = textInverted,
    secondaryFixed = secondaryContainer,
    secondaryFixedDim = secondaryContainer,
    onSecondaryFixed = onSurface,
    onSecondaryFixedVariant = textInverted,
    tertiaryFixed = tertiaryContainer,
    tertiaryFixedDim = tertiaryContainer,
    onTertiaryFixed = onSurface,
    onTertiaryFixedVariant = textInverted,
)

/**
 * Returns a dark Material color scheme mapped from Acorn.
 */
fun acornDarkColorScheme(): ColorScheme = darkColorPalette.toM3ColorScheme(
    primary = PhotonColors.Violet10,
    primaryContainer = PhotonColors.Violet80,
    inversePrimary = PhotonColors.Violet70,
    secondaryContainer = Color(0xFF4B3974),
    tertiaryContainer = PhotonColors.Pink80,
    surface = PhotonColors.DarkGrey60,
    onSurface = PhotonColors.LightGrey05,
    inverseSurface = PhotonColors.LightGrey40,
    errorContainer = PhotonColors.Red80,
    outline = PhotonColors.LightGrey80,
    outlineVariant = PhotonColors.DarkGrey05,
    surfaceBright = PhotonColors.DarkGrey40,
    surfaceDim = PhotonColors.DarkGrey80,
    surfaceContainer = PhotonColors.DarkGrey60,
    surfaceContainerHigh = PhotonColors.DarkGrey50,
    surfaceContainerHighest = PhotonColors.DarkGrey40,
    surfaceContainerLow = PhotonColors.DarkGrey70,
    surfaceContainerLowest = PhotonColors.DarkGrey80,
)

/**
 * Returns a light Material color scheme mapped from Acorn.
 */
fun acornLightColorScheme(): ColorScheme = lightColorPalette.toM3ColorScheme(
    primary = PhotonColors.Ink20,
    primaryContainer = PhotonColors.Violet05,
    inversePrimary = PhotonColors.Violet20,
    secondaryContainer = Color(0xFFE6E0F5),
    tertiaryContainer = PhotonColors.Pink05,
    surface = PhotonColors.LightGrey10,
    onSurface = PhotonColors.DarkGrey90,
    inverseSurface = PhotonColors.DarkGrey60,
    errorContainer = PhotonColors.Red05,
    outline = PhotonColors.LightGrey90,
    outlineVariant = PhotonColors.LightGrey30,
    surfaceBright = PhotonColors.White,
    surfaceDim = PhotonColors.LightGrey30,
    surfaceContainer = PhotonColors.LightGrey10,
    surfaceContainerHigh = PhotonColors.LightGrey20,
    surfaceContainerHighest = PhotonColors.LightGrey30,
    surfaceContainerLow = PhotonColors.LightGrey05,
    surfaceContainerLowest = PhotonColors.White,
)

/**
 * Returns a private Material color scheme mapped from Acorn.
 */
fun acornPrivateColorScheme(): ColorScheme = privateColorPalette.toM3ColorScheme(
    primary = PhotonColors.Violet10,
    primaryContainer = PhotonColors.Violet80,
    inversePrimary = PhotonColors.Violet70,
    secondaryContainer = Color(0xFF4B3974),
    tertiaryContainer = PhotonColors.Pink80,
    surface = Color(0xFF342B4A),
    onSurface = PhotonColors.LightGrey05,
    inverseSurface = PhotonColors.LightGrey40,
    errorContainer = PhotonColors.Red80,
    outline = PhotonColors.LightGrey80,
    outlineVariant = PhotonColors.DarkGrey05,
    surfaceBright = Color(0xFF413857),
    surfaceDim = PhotonColors.Ink90,
    surfaceContainer = Color(0xFF342B4A),
    surfaceContainerHigh = Color(0xFF3B3251),
    surfaceContainerHighest = Color(0xFF413857),
    surfaceContainerLow = Color(0xFF281C3D),
    surfaceContainerLowest = PhotonColors.Ink90,
)

// M3 color scheme extensions

/**
 * @see AcornColors.information
 */
val ColorScheme.information: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.information

/**
 * @see AcornColors.surfaceDimVariant
 */
val ColorScheme.surfaceDimVariant: Color
    @Composable
    @ReadOnlyComposable
    get() = AcornTheme.colors.surfaceDimVariant
