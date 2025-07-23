/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.toolbar

import android.view.Gravity
import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams
import mozilla.components.browser.state.action.AwesomeBarAction
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.compose.base.Divider
import mozilla.components.compose.base.theme.localAcornColors
import mozilla.components.compose.browser.toolbar.BrowserToolbar
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import mozilla.components.feature.toolbar.ToolbarBehaviorController
import mozilla.components.lib.state.ext.observeAsComposableState
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction.SearchAction.SearchEnded
import org.mozilla.fenix.components.toolbar.ToolbarPosition.BOTTOM
import org.mozilla.fenix.components.toolbar.ToolbarPosition.TOP
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.utils.Settings

/**
 * A wrapper over the [BrowserToolbar] composable to allow for extra customisation and
 * integration in the same framework as the [BrowserToolbarView]
 *
 * @param activity [AppCompatActivity] hosting the toolbar.
 * @param container [ViewGroup] which will serve as parent of this View.
 * @param toolbarStore [BrowserToolbarStore] containing the composable toolbar state.
 * @param browserScreenStore [BrowserScreenStore] used for integration with other browser screen functionalities.
 * @param appStore [AppStore] used for integration with other application features.
 * @param browserStore [BrowserStore] used for observing the browsing details.
 * @param settings [Settings] object to get the toolbar position and other settings.
 * @param customTabSession [CustomTabSessionState] if the toolbar is shown in a custom tab.
 * @param tabStripContent Composable content for the tab strip.
 * @param navigationBarContent Composable content for the navigation bar.
 */
@Suppress("LongParameterList")
class BrowserToolbarComposable(
    private val activity: AppCompatActivity,
    container: ViewGroup,
    private val toolbarStore: BrowserToolbarStore,
    private val browserScreenStore: BrowserScreenStore,
    private val appStore: AppStore,
    private val browserStore: BrowserStore,
    private val settings: Settings,
    private val customTabSession: CustomTabSessionState? = null,
    private val tabStripContent: @Composable () -> Unit,
    private val navigationBarContent: (@Composable () -> Unit)?,
) : FenixBrowserToolbarView(
    context = activity,
    settings = settings,
    customTabSession = customTabSession,
) {
    private var showDivider by mutableStateOf(false)

    override val layout = ScrollableToolbarComposeView(activity, this) {
        val shouldShowTabStrip: Boolean = remember { shouldShowTabStrip() }
        val progressBarValue = toolbarStore.observeAsComposableState {
            it.displayState.progressBarConfig?.progress
        }.value ?: 0
        val customColors = browserScreenStore.observeAsComposableState { it.customTabColors }

        DisposableEffect(activity) {
            val toolbarController = ToolbarBehaviorController(
                toolbar = this@BrowserToolbarComposable,
                store = browserStore,
                customTabId = customTabSession?.id,
            )
            toolbarController.start()
            onDispose { toolbarController.stop() }
        }

        BackHandler {
            appStore.dispatch(SearchEnded)
            browserStore.dispatch(AwesomeBarAction.EngagementFinished(abandoned = true))
        }

        FirefoxTheme {
            val firefoxColors = FirefoxTheme.colors
            val customTheme = remember(customColors, firefoxColors) {
                firefoxColors.copy(
                    // Toolbar background
                    layer1 = customColors.value?.toolbarColor?.let { Color(it) } ?: firefoxColors.layer1,
                    // Page origin background
                    layer3 = customColors.value?.toolbarColor?.let { Color(it) } ?: firefoxColors.layer3,
                    // All text but the title
                    textPrimary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.textPrimary,
                    // Title
                    textSecondary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.textSecondary,
                    // All icons tint
                    iconPrimary = customColors.value?.readableColor?.let { Color(it) } ?: firefoxColors.iconPrimary,
                )
            }

            CompositionLocalProvider(localAcornColors provides customTheme) {
                when (shouldShowTabStrip) {
                    true -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                    ) {
                        tabStripContent()
                        BrowserToolbar(showDivider, progressBarValue, settings.shouldUseBottomToolbar)
                    }

                    false -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .wrapContentHeight(),
                    ) {
                        BrowserToolbar(showDivider, progressBarValue, settings.shouldUseBottomToolbar)
                        if (settings.toolbarPosition == BOTTOM) {
                            navigationBarContent?.invoke()
                        }
                    }
                }
            }
        }
    }.apply {
        if (!shouldShowTabStrip()) {
            val params = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

            when (settings.toolbarPosition) {
                TOP -> params.gravity = Gravity.TOP
                BOTTOM -> params.gravity = Gravity.BOTTOM
            }

            layoutParams = params
        }
    }

    init {
        container.addView(layout)
        setToolbarBehavior(settings.toolbarPosition)
        updateDividerVisibility(true)
    }

    @Composable
    private fun BrowserToolbar(
        shouldShowDivider: Boolean,
        progressBarValue: Int,
        shouldUseBottomToolbar: Boolean,
    ) {
        // Ensure the divider is shown together with the toolbar
        Box {
            BrowserToolbar(
                store = toolbarStore,
            )
            @Suppress("MagicNumber")
            if (shouldShowDivider && progressBarValue !in 1..99) {
                Divider(
                    modifier = Modifier.align(
                        when (shouldUseBottomToolbar) {
                            true -> Alignment.TopCenter
                            false -> Alignment.BottomCenter
                        },
                    ),
                )
            }
        }
    }

    override fun updateDividerVisibility(isVisible: Boolean) {
        showDivider = when (customTabSession) {
            null -> isVisible
            else -> false
        }
    }
}
