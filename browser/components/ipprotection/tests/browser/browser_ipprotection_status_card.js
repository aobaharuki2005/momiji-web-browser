/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { LINKS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
});

/**
 * Tests UI updates to the status card in the panel after enable/disable.
 */
add_task(async function test_status_card_in_panel() {
  const l10nIdOn = "ipprotection-connection-status-on";
  const l10nIdOff = "ipprotection-connection-status-off";
  const fiveDaysInMS = 5 * 24 * 60 * 60 * 1000;
  const enabledSince = Date.now() - fiveDaysInMS;
  const mockLocation = {
    name: "United States",
    code: "us",
  };

  let content = await openPanel({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;
  Assert.ok(content.statusCardEl, "ipprotection-status-card should be present");

  Assert.equal(
    statusCard?.statusGroupEl.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct by default"
  );
  Assert.equal(
    statusCard?.statusGroupEl.description,
    "",
    "Time string should be empty"
  );
  Assert.ok(statusCard.locationEl, "Location details should be present");

  let flag =
    statusCard.locationEl?.shadowRoot.querySelector("ipprotection-flag");

  Assert.ok(flag, "Flag component should be present");

  let animationLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => statusCard.animationEl
  );
  let timerUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => JSON.parse(statusCard.statusGroupEl.dataset.l10nArgs).time != ""
  );

  // Set state as if protection is enabled
  await setPanelState({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
    isProtectionEnabled: true,
  });

  content.requestUpdate();

  await Promise.all([
    content.updateComplete,
    timerUpdatedPromise,
    animationLoadedPromise,
  ]);

  Assert.equal(
    statusCard?.statusGroupEl.getAttribute("data-l10n-id"),
    l10nIdOn,
    "Status card connection toggle data-l10n-id should be correct when protection is enabled"
  );
  Assert.ok(statusCard.animationEl, "Status card animation should be present");

  let animationUnloadedPromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => !statusCard.animationEl
  );
  let timerStoppedPromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => JSON.parse(statusCard?.statusGroupEl.dataset.l10nArgs).time === ""
  );

  //   // Set state as if protection is disabled
  await setPanelState({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
    isProtectionEnabled: false,
  });

  content.requestUpdate();

  await Promise.all([
    content.updateComplete,
    animationUnloadedPromise,
    timerStoppedPromise,
  ]);

  Assert.equal(
    statusCard?.statusGroupEl.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct when protection is disabled"
  );
  Assert.ok(
    !statusCard.animationEl,
    "Status card animation should not be present"
  );

  await closePanel();
});

/**
 * Tests that the correct IPProtection events are dispatched on toggle.
 */
add_task(async function test_ipprotection_events_on_toggle() {
  // These events are different from the ones sent by
  // ipprotection-status-card. The prefixed "IPProtection:" events
  // actually change the connection state in the service when dispatched.
  // If the IPProtection events are sent, then we know that the status-card
  // events worked.
  const userEnableEventName = "IPProtection:UserEnable";
  const userDisableEventName = "IPProtection:UserDisable";

  // Reset service state.
  cleanupService();
  IPProtectionService.updateState();

  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
    canEnroll: true,
    proxyPass: {
      status: 200,
      error: undefined,
      pass: makePass(),
    },
  });
  await IPPEnrollAndEntitleManager.refetchEntitlement();

  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let statusCard = content.statusCardEl;

  await BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.statusCardEl
  );

  Assert.ok(statusCard, "Status card should be present");

  let toggle = statusCard?.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  let enableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userEnableEventName
  );

  toggle.click();

  await enableEventPromise;
  Assert.ok("Enable event was found after clicking the toggle");

  let userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    false
  );
  Assert.equal(userEnabledPref, true, "userEnabled pref should be set to true");

  let disableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userDisableEventName
  );

  toggle.click();

  await disableEventPromise;
  Assert.ok("Disable event was found after clicking the toggle");

  userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    true
  );
  Assert.equal(
    userEnabledPref,
    false,
    "userEnabled pref should be set to false"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
  cleanupService();
});
