/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.creditcards

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.runtime.LaunchedEffect
import androidx.fragment.compose.content
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import org.mozilla.fenix.R
import org.mozilla.fenix.SecureFragment
import org.mozilla.fenix.components.StoreProvider
import org.mozilla.fenix.ext.hideToolbar
import org.mozilla.fenix.ext.redirectToReAuth
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorAction
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorEnvironment
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorMiddleware
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorScreen
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorState
import org.mozilla.fenix.settings.creditcards.ui.CreditCardEditorStore
import org.mozilla.fenix.settings.creditcards.ui.DefaultCalendarDataProvider
import org.mozilla.fenix.theme.FirefoxTheme

/**
 * Display a credit card editor for adding and editing a credit card.
 */
class CreditCardEditorFragment : SecureFragment() {

    private val args by navArgs<CreditCardEditorFragmentArgs>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideToolbar()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = content {
        val store = StoreProvider.get(this) {
            CreditCardEditorStore(
                initialState = CreditCardEditorState.Default.copy(inEditMode = args.creditCard != null),
                middleware = listOf(
                    CreditCardEditorMiddleware(
                        storage = requireComponents.core.autofillStorage,
                        calendarDataProvider = DefaultCalendarDataProvider(),
                        coroutineScope = lifecycleScope,
                    ),
                ),
            )
        }.also {
            val environment = CreditCardEditorEnvironment(
                navigateBack = { findNavController().popBackStack() },
            )
            it.dispatch(CreditCardEditorAction.EnvironmentRehydrated(environment))
        }

        LaunchedEffect(Unit) {
            store.dispatch(CreditCardEditorAction.Initialization.InitStarted(args.creditCard))
        }

        FirefoxTheme {
            CreditCardEditorScreen(store)
        }
    }

    /**
     * Close the keyboard, any open dialogs or menus and then reauthenticate if the
     * fragment is paused and the user is not navigating to [CreditCardsManagementFragment].
     */
    override fun onPause() {
        redirectToReAuth(
            listOf(R.id.creditCardsManagementFragment),
            findNavController().currentDestination?.id,
            R.id.creditCardEditorFragment,
        )
        super.onPause()
    }
}
