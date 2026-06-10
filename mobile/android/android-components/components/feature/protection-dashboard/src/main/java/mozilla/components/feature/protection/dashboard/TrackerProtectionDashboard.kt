/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.protection.dashboard

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.base.theme.surfaceDimVariant

/**
 * Composable for the Tracker Protection Dashboard.
 *
 * @param modifier Modifier to be applied to the dashboard.
 * @param appName Application name used in the dashboard header to promote the trackers blocking feature.
 * @param totalTrackersBlocked Total number of trackers blocked this week.
 * @param sitesCount Number of sites the trackers were blocked on.
 * @param dataSavedMB Approximate data saved in megabytes, or null if not available.
 * @param trackersBlocked Breakdown of trackers blocked by their category.
 * @param contentPadding Inner padding for the weekly stats card content.
 * Allows pushing the content down while leaving room for an overlay
 * (e.g. a bottom sheet handle) above the title.
 */
@Composable
fun TrackerProtectionDashboard(
    modifier: Modifier = Modifier,
    appName: String,
    totalTrackersBlocked: Int,
    sitesCount: Int,
    dataSavedMB: Int? = null,
    trackersBlocked: List<TrackersBlockedCategory> = emptyList(),
    contentPadding: PaddingValues = PaddingValues(),
) {
    val colors = rememberProtectionsDashboardColors()
    Column(modifier = modifier) {
        WeeklyStatsCard(
            appName = appName,
            totalTrackersBlocked = totalTrackersBlocked,
            sitesCount = sitesCount,
            dataSavedMB = dataSavedMB,
            colors = colors,
            contentPadding = contentPadding,
        )
        if (trackersBlocked.isNotEmpty()) {
            TrackerBreakdownSection(
                trackersBlocked = trackersBlocked,
                maxCount = trackersBlocked.maxOfOrNull { it.count } ?: 1,
                colors = colors,
            )
        }
    }
}

@Composable
private fun WeeklyStatsCard(
    appName: String,
    totalTrackersBlocked: Int,
    sitesCount: Int,
    dataSavedMB: Int?,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(),
) {
    val gradientBrush = Brush.horizontalGradient(
        colorStops = arrayOf(
            0.031f to colors.gradientStart,
            0.7816f to colors.gradientEnd,
        ),
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(gradientBrush),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(contentPadding)
                .padding(horizontal = AcornTheme.layout.space.dynamic200)
                .padding(top = AcornTheme.layout.space.static150)
                .padding(bottom = AcornTheme.layout.space.static100),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (totalTrackersBlocked == 0) {
                WeeklyStatsEmptyContent(appName, colors)
            } else {
                WeeklyStatsContent(
                    totalTrackersBlocked = totalTrackersBlocked,
                    sitesCount = sitesCount,
                    dataSavedMB = dataSavedMB,
                    colors = colors,
                )
            }
        }
    }
}

@Composable
private fun WeeklyStatsEmptyContent(
    appName: String,
    colors: ProtectionsDashboardColors,
) {
    Image(
        painter = painterResource(R.drawable.firefox_pictorgram_shield_check_rgb_2),
        contentDescription = null,
        modifier = Modifier.size(40.dp),
    )

    Spacer(modifier = Modifier.height(AcornTheme.layout.space.static100))

    Text(
        text = stringResource(R.string.mozac_protections_dashboard_empty_title, appName),
        modifier = Modifier.semantics { heading() },
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Medium,
        color = colors.textPrimary,
        textAlign = TextAlign.Center,
    )

    Text(
        text = stringResource(R.string.mozac_protections_dashboard_empty_subtitle),
        style = MaterialTheme.typography.bodyMedium,
        color = colors.textSecondary,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun WeeklyStatsContent(
    totalTrackersBlocked: Int,
    sitesCount: Int,
    dataSavedMB: Int?,
    colors: ProtectionsDashboardColors,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(R.drawable.firefox_pictorgram_shield_check_rgb_2),
            contentDescription = null,
            modifier = Modifier.size(AcornTheme.layout.space.static300),
        )

        Spacer(modifier = Modifier.width(AcornTheme.layout.space.static100))

        Text(
            text = stringResource(R.string.mozac_protections_dashboard_trackers_blocked_this_week_title),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
            color = colors.textPrimary,
        )
    }

    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) { heading() },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = totalTrackersBlocked.toString(),
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                color = colors.textPrimary,
                letterSpacing = 0.18.sp,
            )

            if (sitesCount > 0) {
                Text(
                    text = pluralStringResource(
                        // If we are to use these in the future, move out string from static_strings.xml
                        R.plurals.mozac_protections_dashboard_across_sites,
                        sitesCount,
                        sitesCount,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textSecondary,
                )
            }
        }

        Image(
            painter = painterResource(R.drawable.delete_me),
            contentDescription = null,
            modifier = Modifier
                .size(80.dp)
                .align(Alignment.BottomEnd)
                .offset(y = AcornTheme.layout.space.static100),
        )
    }

    dataSavedMB?.takeIf { it > 0 }?.let { dataSaved ->
        Spacer(modifier = Modifier.height(AcornTheme.layout.space.dynamic100))

        DataSavedChip(
            dataSavedMB = dataSaved,
            colors = colors,
        )
    }
}

@Composable
private fun DataSavedChip(
    dataSavedMB: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.semantics { heading() },
        shape = MaterialTheme.shapes.small,
        color = colors.chipBackground,
    ) {
        Text(
            text = pluralStringResource(
                // If we are to use these in the future, move out string from static_strings.xml
                R.plurals.mozac_protections_dashboard_data_saved,
                dataSavedMB,
                dataSavedMB,
            ),
            modifier = Modifier.padding(
                horizontal = AcornTheme.layout.space.static100,
                vertical = AcornTheme.layout.space.static25,
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.chipText,
        )
    }
}

@Composable
private fun TrackerBreakdownSection(
    trackersBlocked: List<TrackersBlockedCategory>,
    maxCount: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(top = AcornTheme.layout.space.static200)
            .padding(horizontal = AcornTheme.layout.space.dynamic200)
            .clip(MaterialTheme.shapes.extraLarge),
        verticalArrangement = Arrangement.spacedBy(AcornTheme.layout.space.static25),
    ) {
        trackersBlocked.forEach { category ->
            TrackerCategoryRow(
                trackersBlocked = category,
                maxCount = maxCount,
                colors = colors,
            )
        }
    }
}

@Composable
private fun TrackerCategoryRow(
    trackersBlocked: TrackersBlockedCategory,
    maxCount: Int,
    colors: ProtectionsDashboardColors,
    modifier: Modifier = Modifier,
) {
    val isEmpty = trackersBlocked.count == 0
    val contentColor = if (isEmpty) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.extraSmall)
            .background(MaterialTheme.colorScheme.surfaceDimVariant)
            .padding(vertical = AcornTheme.layout.space.static100)
            .padding(horizontal = AcornTheme.layout.space.static200)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(trackersBlocked.icon),
            contentDescription = null,
            modifier = Modifier.size(AcornTheme.layout.space.static300),
            tint = contentColor,
        )

        Spacer(modifier = Modifier.width(AcornTheme.layout.space.static200))

        Column(
            modifier = Modifier.weight(1f),
        ) {
            Text(
                text = stringResource(trackersBlocked.name),
                style = MaterialTheme.typography.bodyMedium,
                color = contentColor,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            if (!isEmpty) {
                Spacer(modifier = Modifier.height(AcornTheme.layout.space.static100))

                val fraction = if (maxCount > 0) trackersBlocked.count.toFloat() / maxCount else 0f
                val trackHeight = AcornTheme.layout.space.static100
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(trackHeight),
                ) {
                    val strokeWidth = trackHeight.toPx()
                    val y = size.height / 2

                    drawRoundRect(
                        color = colors.progressBar,
                        size = Size(size.width * fraction, strokeWidth),
                        topLeft = Offset(0f, y - strokeWidth / 2),
                        cornerRadius = CornerRadius(strokeWidth / 2),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(AcornTheme.layout.space.static200))

        Text(
            text = trackersBlocked.count.toString(),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (isEmpty) contentColor else colors.textPrimary,
            textAlign = TextAlign.End,
        )
    }
}

@PreviewLightDark
@Composable
@Suppress("MagicNumber")
private fun EmptyTrackerProtectionDashboardPreview() {
    AcornTheme {
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface)
                .padding(AcornTheme.layout.space.static200),
        ) {
            WeeklyStatsCard(
                appName = "Firefox",
                totalTrackersBlocked = 0,
                sitesCount = 0,
                dataSavedMB = 0,
                colors = previewDashboardColors(),
            )
            TrackerBreakdownSection(
                trackersBlocked = emptyList(),
                maxCount = 1,
                colors = previewDashboardColors(),
            )
        }
    }
}

@PreviewLightDark
@Composable
@Suppress("MagicNumber")
private fun TrackerProtectionDashboardPreview() {
    val trackersBlocked = listOf(
        TrackersBlockedCategory(
            icon = mozilla.components.ui.icons.R.drawable.mozac_ic_cookies_24,
            name = R.string.protections_dashboard_category_cookies,
            count = 302,
        ),
        TrackersBlockedCategory(
            icon = mozilla.components.ui.icons.R.drawable.mozac_ic_social_tracker_24,
            name = R.string.protections_dashboard_category_social,
            count = 241,
        ),
        TrackersBlockedCategory(
            icon = mozilla.components.ui.icons.R.drawable.mozac_ic_fingerprinter_24,
            name = R.string.protections_dashboard_category_fingerprinters,
            count = 0,
        ),
        TrackersBlockedCategory(
            icon = mozilla.components.ui.icons.R.drawable.mozac_ic_image_24,
            name = R.string.protections_dashboard_category_tracking_content,
            count = 0,
        ),
    )
    AcornTheme {
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface)
                .padding(AcornTheme.layout.space.static200),
        ) {
            WeeklyStatsCard(
                appName = "Firefox",
                totalTrackersBlocked = 754,
                sitesCount = 0,
                dataSavedMB = 0,
                colors = previewDashboardColors(),
            )
            TrackerBreakdownSection(
                trackersBlocked = trackersBlocked,
                maxCount = trackersBlocked.maxOfOrNull { it.count } ?: 1,
                colors = previewDashboardColors(),
            )
        }
    }
}

@Suppress("MagicNumber")
@Composable
@ReadOnlyComposable
private fun previewDashboardColors() = when (isSystemInDarkTheme()) {
    true -> ProtectionsDashboardColors(
        background = Color(0xFF4B3974),
        textPrimary = Color(0xFFFBFBFE),
        textSecondary = Color(0xFFFBFBFE),
        textAccent = Color(0xFFD9BFFF),
        chipBackground = Color(0xFF1C1B22).copy(alpha = 0.4f),
        chipText = Color(0xFFD9BFFF),
        progressBar = Color(0xFFD9BFFF),
        gradientStart = Color(0xFFAB71FF).copy(alpha = 0.5f),
        gradientEnd = Color(0xFFFF8A50).copy(alpha = 0.5f),
    )
    else -> ProtectionsDashboardColors(
        background = Color(0xFFE6E0F5),
        textPrimary = Color(0xFF15141A),
        textSecondary = Color(0xFF5B5B66),
        textAccent = Color(0xFF312A64),
        chipBackground = Color.White.copy(alpha = 0.4f),
        chipText = Color(0xFF312A64),
        progressBar = Color(0xFF592ACB),
        gradientStart = Color(0xFFD9BFFF).copy(alpha = 0.5f),
        gradientEnd = Color(0xFFFFD5B2).copy(alpha = 0.5f),
    )
}

/**
 * Represents a category of trackers with its count.
 *
 * @property icon Drawable resource ID for the category icon.
 * @property name String resource ID for the category name.
 * @property count Number of trackers blocked in this category.
 */
data class TrackersBlockedCategory(
    @param:DrawableRes val icon: Int,
    @param:StringRes val name: Int,
    val count: Int,
)
