/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.compose.browser.toolbar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.tooling.preview.PreviewParameter
import androidx.compose.ui.tooling.preview.PreviewParameterProvider
import androidx.compose.ui.unit.dp
import androidx.window.core.layout.WindowSizeClass
import mozilla.components.compose.base.progressbar.AnimatedProgressBar
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.compose.browser.toolbar.concept.Action
import mozilla.components.compose.browser.toolbar.concept.Action.ActionButtonRes
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.ContentDescription.StringResContentDescription
import mozilla.components.compose.browser.toolbar.concept.Action.SearchSelectorAction.Icon.DrawableResIcon
import mozilla.components.compose.browser.toolbar.concept.BrowserToolbarTestTags.ADDRESSBAR_URL_BOX
import mozilla.components.compose.browser.toolbar.concept.PageOrigin
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarInteraction.BrowserToolbarEvent
import mozilla.components.compose.browser.toolbar.store.ProgressBarConfig
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Bottom
import mozilla.components.compose.browser.toolbar.store.ToolbarGravity.Top
import mozilla.components.compose.browser.toolbar.ui.Origin
import mozilla.components.ui.icons.R as iconsR

private const val NO_TOOLBAR_PADDING_DP = 0
private const val TOOLBAR_PADDING_DP = 8
private const val LARGE_TOOLBAR_PADDING_DP = 24
private const val MINIMUM_PROGRESS_BAR_STATE = 1
private const val MAXIMUM_PROGRESS_BAR_STATE = 99

/**
 * Sub-component of the [BrowserToolbar] responsible for displaying the URL and related
 * controls ("display mode").
 *
 * @param pageOrigin Details about the website origin.
 * @param gravity [ToolbarGravity] for where the toolbar is being placed on the screen.
 * @param progressBarConfig [ProgressBarConfig] configuration for the progress bar.
 * If `null` a progress bar will not be displayed.
 * @param browserActionsStart List of browser [Action]s to be displayed at the start of the
 * toolbar, outside of the URL bounding box.
 * These should be actions relevant to the browser as a whole.
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction).
 * @param pageActionsStart List of navigation [Action]s to be displayed between [browserActionsStart]
 * and [pageOrigin], inside of the URL bounding box.
 * These should be actions relevant to specific webpages as opposed to [browserActionsStart].
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/pageAction).
 * @param pageActionsEnd List of page [Action]s to be displayed between [pageOrigin] and [browserActionsEnd],
 * inside of the URL bounding box.
 * These should be actions relevant to specific webpages as opposed to [browserActionsStart].
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/pageAction).
 * @param browserActionsEnd List of browser [Action]s to be displayed at the end of the toolbar,
 * outside of the URL bounding box.
 * These should be actions relevant to the browser as a whole.
 * See [MDN docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserAction).
 * @param onInteraction Callback for handling [BrowserToolbarEvent]s on user interactions.
 */
@Composable
@Suppress("LongMethod", "CyclomaticComplexMethod")
fun BrowserDisplayToolbar(
    pageOrigin: PageOrigin,
    gravity: ToolbarGravity,
    progressBarConfig: ProgressBarConfig?,
    browserActionsStart: List<Action> = emptyList(),
    pageActionsStart: List<Action> = emptyList(),
    pageActionsEnd: List<Action> = emptyList(),
    browserActionsEnd: List<Action> = emptyList(),
    onInteraction: (BrowserToolbarEvent) -> Unit,
) {
    val isProgressBarShown = remember(progressBarConfig) {
        progressBarConfig != null &&
            progressBarConfig.progress in MINIMUM_PROGRESS_BAR_STATE..MAXIMUM_PROGRESS_BAR_STATE
    }
    val windowSizeClass = currentWindowAdaptiveInfo().windowSizeClass
    val isSmallWidthScreen = remember(windowSizeClass) {
        windowSizeClass.minWidthDp < WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND
    }

    Box(
        modifier = Modifier
            .background(color = AcornTheme.colors.layer1)
            .fillMaxWidth()
            .semantics { testTagsAsResourceId = true },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = when (isSmallWidthScreen) {
                        true -> NO_TOOLBAR_PADDING_DP.dp
                        else -> LARGE_TOOLBAR_PADDING_DP.dp
                    },
                    vertical = 8.dp,
                )
                .height(48.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (browserActionsStart.isNotEmpty()) {
                ActionContainer(
                    actions = browserActionsStart,
                    onInteraction = onInteraction,
                )
            }

            Box(
                modifier = Modifier.weight(1f),
            ) {
                // This is just for showing the URL background.
                // The page actions and URL will be placed on top with a potential x offset.
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(
                            start = when {
                                (isSmallWidthScreen && pageActionsStart.isNotEmpty()) ||
                                    browserActionsStart.isEmpty() -> TOOLBAR_PADDING_DP.dp
                                else -> NO_TOOLBAR_PADDING_DP.dp
                            },
                            end = when {
                                (isSmallWidthScreen && pageActionsEnd.isNotEmpty()) ||
                                    browserActionsEnd.isEmpty() -> TOOLBAR_PADDING_DP.dp
                                else -> NO_TOOLBAR_PADDING_DP.dp
                            },
                        )
                        .background(
                            color = AcornTheme.colors.layer3,
                            shape = RoundedCornerShape(90.dp),
                        )
                        .height(48.dp)
                        .fillMaxWidth(),
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(
                        // Force the URL extend a bit under page actions to ensure showing more characters.
                        when (isSmallWidthScreen) {
                            true -> TOOLBAR_PADDING_DP.dp.unaryMinus()
                            false -> NO_TOOLBAR_PADDING_DP.dp
                        },
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (pageActionsStart.isNotEmpty()) {
                        val areBrowserActionsEmpty = browserActionsStart.isEmpty() && browserActionsEnd.isEmpty()
                        ActionContainer(
                            actions = pageActionsStart,
                            onInteraction = onInteraction,
                            modifier = Modifier.padding(
                                start = when {
                                    (isSmallWidthScreen && pageOrigin.url.isNullOrEmpty()) ||
                                    (isSmallWidthScreen && areBrowserActionsEmpty) ||
                                        (!isSmallWidthScreen && browserActionsStart.isEmpty()) -> TOOLBAR_PADDING_DP.dp
                                    else -> NO_TOOLBAR_PADDING_DP.dp
                                },
                            ),
                        )
                    }

                    Origin(
                        hint = pageOrigin.hint,
                        modifier = Modifier
                            .height(56.dp)
                            .weight(1f)
                            .padding(
                                start = when {
                                    // These first two conditions apply to the scenario of showing the search selector
                                    isSmallWidthScreen && pageOrigin.url.isNullOrEmpty() -> TOOLBAR_PADDING_DP.dp
                                    pageOrigin.url.isNullOrEmpty() -> NO_TOOLBAR_PADDING_DP.dp

                                    browserActionsStart.isEmpty() && pageActionsStart.isEmpty() ->
                                        TOOLBAR_PADDING_DP.dp * 2
                                    pageActionsStart.isEmpty() -> TOOLBAR_PADDING_DP.dp
                                    else -> NO_TOOLBAR_PADDING_DP.dp
                                },
                                end = when {
                                    // These first two conditions apply to the scenario of showing the search selector
                                    isSmallWidthScreen && pageOrigin.url.isNullOrEmpty() -> TOOLBAR_PADDING_DP.dp
                                    pageOrigin.url.isNullOrEmpty() -> NO_TOOLBAR_PADDING_DP.dp

                                    pageActionsEnd.isEmpty() && browserActionsEnd.isEmpty() -> TOOLBAR_PADDING_DP.dp * 2
                                    pageActionsEnd.isEmpty() -> TOOLBAR_PADDING_DP.dp
                                    else -> NO_TOOLBAR_PADDING_DP.dp
                                },
                            )
                            .testTag(ADDRESSBAR_URL_BOX),
                        url = pageOrigin.url,
                        title = pageOrigin.title,
                        textGravity = pageOrigin.textGravity,
                        contextualMenuOptions = pageOrigin.contextualMenuOptions,
                        onClick = pageOrigin.onClick,
                        onLongClick = pageOrigin.onLongClick,
                        onInteraction = onInteraction,
                    )

                    if (pageActionsEnd.isNotEmpty()) {
                        val areBrowserActionsEmpty = browserActionsStart.isEmpty() && browserActionsEnd.isEmpty()
                        ActionContainer(
                            actions = pageActionsEnd,
                            onInteraction = onInteraction,
                            modifier = Modifier.padding(
                                end = when {
                                    (isSmallWidthScreen && pageOrigin.url.isNullOrEmpty()) ||
                                    (isSmallWidthScreen && areBrowserActionsEmpty) ||
                                        (!isSmallWidthScreen && browserActionsEnd.isEmpty()) -> TOOLBAR_PADDING_DP.dp
                                    else -> NO_TOOLBAR_PADDING_DP.dp
                                },
                            ),
                        )
                    }
                }
            }

            if (browserActionsEnd.isNotEmpty()) {
                ActionContainer(
                    actions = browserActionsEnd,
                    onInteraction = onInteraction,
                )
            }
        }

        if (progressBarConfig != null) {
            AnimatedProgressBar(
                progress = progressBarConfig.progress,
                color = progressBarConfig.color,
                modifier = Modifier.align(
                    when (gravity) {
                        Top -> Alignment.BottomCenter
                        Bottom -> Alignment.TopCenter
                    },
                ),
            )
        }

        if (!isProgressBarShown) {
            HorizontalDivider(
                modifier = Modifier.align(
                    when (gravity) {
                        Top -> Alignment.BottomCenter
                        Bottom -> Alignment.TopCenter
                    },
                ),
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun BrowserDisplayToolbarPreview(
    @PreviewParameter(DisplayToolbarDataProvider::class) config: DisplayToolbarPreviewModel,
) {
    AcornTheme {
        BrowserDisplayToolbar(
            gravity = config.gravity,
            progressBarConfig = ProgressBarConfig(progress = 66),
            browserActionsStart = config.browserStartActions,
            pageActionsStart = config.pageActionsStart,
            pageOrigin = PageOrigin(
                hint = R.string.mozac_browser_toolbar_search_hint,
                title = config.title,
                url = config.url,
                onClick = object : BrowserToolbarEvent {},
            ),
            pageActionsEnd = config.pageActionsEnd,
            browserActionsEnd = config.browserEndActions,
            onInteraction = {},
        )
    }
}

private data class DisplayToolbarPreviewModel(
    val browserStartActions: List<Action>,
    val pageActionsStart: List<Action>,
    val title: String?,
    val url: String?,
    val gravity: ToolbarGravity,
    val pageActionsEnd: List<Action>,
    val browserEndActions: List<Action>,
)
private class DisplayToolbarDataProvider : PreviewParameterProvider<DisplayToolbarPreviewModel> {
    val browserStartActions = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_home_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val pageActionsStart = listOf(
        SearchSelectorAction(
            icon = DrawableResIcon(iconsR.drawable.mozac_ic_search_24),
            contentDescription = StringResContentDescription(resourceId = android.R.string.untitled),
            menu = { emptyList() },
            onClick = null,
        ),
    )
    val pageActionsEnd = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_arrow_clockwise_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val browserActionsEnd = listOf(
        ActionButtonRes(
            drawableResId = iconsR.drawable.mozac_ic_ellipsis_vertical_24,
            contentDescription = android.R.string.untitled,
            onClick = object : BrowserToolbarEvent {},
        ),
    )
    val title = "Firefox"
    val url = "mozilla.com/firefox"

    override val values = sequenceOf(
        DisplayToolbarPreviewModel(
            browserStartActions = browserStartActions,
            pageActionsStart = pageActionsStart,
            title = title,
            url = url,
            gravity = Top,
            pageActionsEnd = pageActionsEnd,
            browserEndActions = browserActionsEnd,
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = emptyList(),
            pageActionsStart = pageActionsStart,
            title = null,
            url = url,
            gravity = Bottom,
            pageActionsEnd = pageActionsEnd,
            browserEndActions = emptyList(),
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = browserStartActions,
            pageActionsStart = emptyList(),
            title = title,
            url = url,
            gravity = Top,
            pageActionsEnd = emptyList(),
            browserEndActions = browserActionsEnd,
        ),
        DisplayToolbarPreviewModel(
            browserStartActions = emptyList(),
            pageActionsStart = emptyList(),
            title = null,
            url = null,
            gravity = Bottom,
            pageActionsEnd = emptyList(),
            browserEndActions = emptyList(),
        ),
    )
}
