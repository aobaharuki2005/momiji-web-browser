/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.trackingprotection

import android.app.Dialog
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.unit.dp
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat.Type.systemBars
import androidx.fragment.compose.content
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import mozilla.components.compose.base.BottomSheetHandle
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.FINGERPRINTERS
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.SOCIAL
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.SUSPICIOUS_FINGERPRINTERS
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.TRACKERS
import mozilla.components.concept.engine.content.blocking.TrackingProtectionEvent.Companion.TRACKING_COOKIES
import mozilla.components.feature.protection.dashboard.TrackerProtectionDashboard
import mozilla.components.feature.protection.dashboard.TrackersBlockedCategory
import mozilla.components.feature.session.TrackingProtectionUseCases
import mozilla.components.support.base.log.logger.Logger
import mozilla.components.support.utils.DefaultDateTimeProvider
import org.mozilla.fenix.R
import org.mozilla.fenix.ext.components
import org.mozilla.fenix.ext.runIfFragmentIsAttached
import org.mozilla.fenix.theme.FirefoxTheme
import java.util.concurrent.TimeUnit
import com.google.android.material.R as materialR
import mozilla.components.ui.icons.R as iconsR

/**
 * [BottomSheetDialog] showing the global protections dashboard.
 */
class ProtectionsDashboard : BottomSheetDialogFragment() {
    private val logger = Logger("ProtectionsDashboard")
    private var trackingProtectionsUseCases: TrackingProtectionUseCases? = null
    private var totalTrackersBlocked by mutableIntStateOf(0)
    private var blockedTrackersCategoriesCount by mutableStateOf<List<TrackersBlockedCategory>>(emptyList())

    override fun onAttach(context: Context) {
        super.onAttach(context)

        trackingProtectionsUseCases = context.components.useCases.trackingProtectionUseCases
        val now = DefaultDateTimeProvider().currentTimeMillis()
        val oneWeekAgo = now - TimeUnit.DAYS.toMillis(7)

        trackingProtectionsUseCases?.fetchTrackingEvents(
            dateFrom = oneWeekAgo,
            dateTo = DefaultDateTimeProvider().currentTimeMillis(),
            onSuccess = { blockedTrackersCategoriesCount = it.blockedTrackersCategories },
            onError = { logger.error("Could not fetch blocked trackers list", it) },
        )
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog =
        (super.onCreateDialog(savedInstanceState) as BottomSheetDialog).apply {
            setOnShowListener {
                runIfFragmentIsAttached {
                    val bottomSheet = findViewById<FrameLayout>(materialR.id.design_bottom_sheet)
                    bottomSheet?.let {
                        ViewCompat.setOnApplyWindowInsetsListener(it) { view, insets ->
                            val systemBarInsets = insets.getInsets(systemBars())
                            view.setPadding(0, systemBarInsets.top, 0, systemBarInsets.bottom)
                            insets
                        }
                    }
                    bottomSheet?.setBackgroundResource(R.drawable.bottom_sheet_with_top_rounded_corners)

                    behavior.peekHeight = context.resources.displayMetrics.heightPixels
                    behavior.state = BottomSheetBehavior.STATE_EXPANDED
                }
            }
        }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        FirefoxTheme {
            BackHandler {
                dismiss()
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(
                        MaterialTheme.shapes.extraLarge.copy(
                            bottomStart = CornerSize(0.dp),
                            bottomEnd = CornerSize(0.dp),
                        ),
                    )
                    .semantics { isTraversalGroup = true },
            ) {
                TrackerProtectionDashboard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { traversalIndex = 0f },
                    appName = stringResource(R.string.firefox),
                    totalTrackersBlocked = blockedTrackersCategoriesCount.sumOf { it.count },
                    sitesCount = 0, // We don't yet have an API to get this data from.
                    dataSavedMB = null, // We don't yet have an API to get this data from.
                    trackersBlocked = blockedTrackersCategoriesCount,
                    contentPadding = PaddingValues(
                        top = FirefoxTheme.layout.size.static300, // handle height + its top padding
                    ),
                )

                BottomSheetHandle(
                    onRequestDismiss = ::dismiss,
                    contentDescription = "",
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = FirefoxTheme.layout.size.static200)
                        .semantics { traversalIndex = 1f },
                )
            }
        }
    }

    private val List<TrackingProtectionEvent>?.blockedTrackersCategories: List<TrackersBlockedCategory>
        get() {
            val events = this ?: return emptyList()
            val trackerCategories = listOf(
                Triple(
                    R.string.etp_cookies_title,
                    iconsR.drawable.mozac_ic_cookies_24,
                    setOf(TRACKING_COOKIES),
                ),
                Triple(
                    R.string.etp_social_media_trackers_title,
                    iconsR.drawable.mozac_ic_social_tracker_24,
                    setOf(SOCIAL),
                ),
                Triple(
                    R.string.tracking_dashboard_fingerprinters_category_name,
                    iconsR.drawable.mozac_ic_fingerprinter_24,
                    setOf(FINGERPRINTERS, SUSPICIOUS_FINGERPRINTERS),
                ),
                Triple(
                    R.string.etp_tracking_content_title,
                    iconsR.drawable.mozac_ic_image_24,
                    setOf(TRACKERS),
                ),
            )
            return trackerCategories.map { (trackerNameRes, trackerIconRes, types) ->
                val count = events
                    .filter { it.type in types }
                    .sumOf { it.count }
                TrackersBlockedCategory(trackerIconRes, trackerNameRes, count)
            }
        }
}
