/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.fragment.app.Fragment
import androidx.fragment.compose.content
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.concept.engine.ipprotection.ServiceState
import mozilla.components.feature.ipprotection.debug.IPProtectionStateDebugContent
import mozilla.components.feature.ipprotection.store.IPProtectionAction
import mozilla.components.feature.ipprotection.store.state.AccountStatus
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.lib.state.ext.observeAsComposableState
import mozilla.telemetry.glean.private.NoExtras
import org.mozilla.fenix.GleanMetrics.Vpn
import org.mozilla.fenix.components.components
import org.mozilla.fenix.e2e.SystemInsetsPaddedFragment
import org.mozilla.fenix.ext.hideToolbar
import org.mozilla.fenix.ext.requireComponents
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.theme.FirefoxTheme

/** Fragment hosting the IP Protection settings screen. */
class IPProtectionFragment : Fragment(), SystemInsetsPaddedFragment {

    private var showDebugDialog by mutableStateOf(false)
    private val args: IPProtectionFragmentArgs by navArgs()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (args.startAuthFlow) {
            requireComponents.ipProtection.store.dispatch(IPProtectionAction.Toggle)
        }
    }

    @OptIn(ExperimentalAndroidComponentsApi::class)
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ) = content {
        val state = components.ipProtection.store.observeAsComposableState { it }.value

        // When navigating to the fragment from the vpn onboarding screen, it immediately starts the auth flow.
        // To make the transition smoother, we prevent the fragment from drawing UI in that case.
        if (shouldHideUi(state)) return@content

        FirefoxTheme {
            IPProtectionScreen(
                state = state,
                readyToUse = state.readyToUse(),
                syncingData = state.syncingData(),
                onVpnToggle = { enabled ->
                    if (enabled) {
                        requireContext().settings().hasAlreadyUsedVpn = true
                    }
                    requireComponents.ipProtection.store.dispatch(IPProtectionAction.Toggle)
                },
                onLearnMoreClick = {
                    Vpn.settingsLearnMoreTapped.record(NoExtras())
                    SupportUtils.launchSandboxCustomTab(
                        requireActivity(),
                        SupportUtils.getSumoURLForTopic(
                            requireActivity(),
                            SupportUtils.SumoTopic.VPN,
                            useMobilePage = false,
                        ),
                    )
                },
                onGetStartedClick = {
                    requireComponents.ipProtection.store.dispatch(IPProtectionAction.Toggle)
                },
                showDebugAction = requireContext().settings().showSecretDebugMenuThisSession,
                onDebugActionClick = { showDebugDialog = true },
                onNavigateBack = { findNavController().popBackStack() },
            )

            if (showDebugDialog) {
                Dialog(
                    onDismissRequest = { showDebugDialog = false },
                    properties = DialogProperties(usePlatformDefaultWidth = false),
                ) {
                    IPProtectionStateDebugContent(state)
                }
            }
        }
    }

    /**
     * ServiceState is the source of truth for vpn "readiness". Proxy might error out, the data limit might
     * be reached, but the user is entitled to interrace with it. We also have AccountStatus entitlement,
     * but there is a tiny gap between as enrolling for IPProtection service, and the service actually
     * becoming active and sending us data - the gap that should be presented as "connecting" state.
     */
    @OptIn(ExperimentalAndroidComponentsApi::class)
    private fun IPProtectionState.readyToUse() = serviceStatus == ServiceState.Ready

    /**
     * Syncing state locks the screen from interaction, so we want to be explicit about it: for now, it is
     * specifically for the enrollment state - when the user has passed the auth flow, but the toolkit
     * service has not been updated yet.
     * Otherwise, if the ServiceState is not `Ready`, the user gets a "get started" button.
     */
    @OptIn(ExperimentalAndroidComponentsApi::class)
    private fun IPProtectionState.syncingData(): Boolean {
        return serviceStatus == ServiceState.Unauthenticated &&
            (
                accountState.status == AccountStatus.AwaitingEnrollment ||
                    accountState.status == AccountStatus.Authenticated ||
                    accountState.status == AccountStatus.EnrolledAndEntitled
            )
    }

    private fun IPProtectionState.authInProgress() = when (accountState.status) {
        AccountStatus.RequestingAuthentication,
        AccountStatus.RequestingAuthorization,
        AccountStatus.AwaitingAuthentication,
        AccountStatus.AwaitingAuthorization,
            -> true
        else -> false
    }

    private fun shouldHideUi(
        state: IPProtectionState,
        shouldStartAuthFlow: Boolean = args.startAuthFlow,
    ) = shouldStartAuthFlow && state.authInProgress()

    override fun onResume() {
        super.onResume()
        hideToolbar()
    }
}
