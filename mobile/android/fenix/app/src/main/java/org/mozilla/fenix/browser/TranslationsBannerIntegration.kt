/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser

import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.res.stringResource
import androidx.core.view.isVisible
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChangedBy
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.components.lib.state.helpers.AbstractBinding
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.store.BrowserScreenState
import org.mozilla.fenix.browser.store.BrowserScreenStore
import org.mozilla.fenix.databinding.FragmentBrowserBinding
import org.mozilla.fenix.theme.FirefoxTheme
import org.mozilla.fenix.translations.TranslationToolbar

/**
 * Helper for showing the translations banner.
 *
 * @param browserScreenStore [BrowserScreenStore] to sync the current translations status from.
 * @param binding [FragmentBrowserBinding] to inflate the banner into when needed.
 */
class TranslationsBannerIntegration(
    private val browserScreenStore: BrowserScreenStore,
    private val binding: FragmentBrowserBinding,
) : AbstractBinding<BrowserScreenState>(browserScreenStore) {
    override suspend fun onState(flow: Flow<BrowserScreenState>) {
        flow.distinctUntilChangedBy { it.pageTranslationStatus.isTranslated }
            .collect {
                if (it.pageTranslationStatus.isTranslated) {
                    getViewOrInflate().apply {
                        isVisible = true
                    }
                } else {
                    // Ensure we're not inflating the stub just to hide it.
                    (binding.root.findViewById<View>(R.id.translationsBanner) as? ComposeView)?.apply {
                        isVisible = false
                        disposeComposition()
                    }
                }
            }
    }

    @Composable
    private fun TranslationsBannerHost() {
        val sourceLanguage = browserScreenStore.observeAsComposableState {
            it.pageTranslationStatus.fromSelectedLanguage?.localizedDisplayName ?: ""
        }.value
        val targetLanguage = browserScreenStore.observeAsComposableState {
            it.pageTranslationStatus.toSelectedLanguage?.localizedDisplayName ?: ""
        }.value

        FirefoxTheme {
            TranslationToolbar(
                label = stringResource(
                    R.string.translation_toolbar_translated_from_and_to,
                    sourceLanguage,
                    targetLanguage,
                ),
            )
        }
    }

    private fun getViewOrInflate() = binding.root.findViewById(R.id.translationsBanner)
        ?: binding.translationsBannerStub.inflate().also {
            (it as? ComposeView)?.apply {
                setContent { TranslationsBannerHost() }
                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            }
        }
}
