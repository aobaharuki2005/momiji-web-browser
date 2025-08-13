/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

/**
 * Tests that toolbar widget is added and removed based on
 * `browser.ipProtection.enabled`.
 */
add_task(async function toolbar_added_and_removed() {
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection widget should be added to the navbar"
  );
  let position = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  ).position;
  Assert.equal(
    position,
    7,
    "IP Protection widget added in the correct position"
  );
  // Disable the feature
  Services.prefs.clearUserPref("browser.ipProtection.enabled");
  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.equal(widget, null, "IP Protection widget is removed");

  // Reenable the feature
  Services.prefs.setBoolPref("browser.ipProtection.enabled", true);
  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection widget should be added back to the navbar"
  );
});

/**
 * Tests that the toolbar icon state updates when the connection status changes
 */

add_task(async function toolbar_icon_status() {
  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  let panelInitPromise = BrowserTestUtils.waitForEvent(
    document,
    "IPProtection:Init"
  );
  button.click();
  await Promise.all([panelShownPromise, panelInitPromise]);

  let panelView = PanelMultiView.getViewNode(
    document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);
  content.state.isSignedIn = true;
  content.requestUpdate();
  await content.updateComplete;
  lazy.IPProtectionService.isSignedIn = true;

  Assert.ok(content, "Panel content should be present");
  let toggle = content.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  let vpnOnPromise = BrowserTestUtils.waitForEvent(
    lazy.IPProtectionService,
    "IPProtectionService:Started"
  );
  // Toggle the VPN on
  toggle.click();
  await vpnOnPromise;
  Assert.ok(
    button.classList.contains("ipprotection-on"),
    "Toolbar icon should now show connected status"
  );
  let vpnOffPromise = BrowserTestUtils.waitForEvent(
    lazy.IPProtectionService,
    "IPProtectionService:Stopped"
  );
  // Toggle the VPN off
  toggle.click();
  await vpnOffPromise;
  Assert.ok(
    !button.classList.contains("ipprotection-on"),
    "Toolbar icon should now show disconnected status"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

add_task(async function customize_toolbar_remove_widget() {
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection toolbaritem should be visible"
  );
  let prevPosition = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  ).position;

  let stoppedEventPromise = BrowserTestUtils.waitForEvent(
    lazy.IPProtectionService,
    "IPProtectionService:Stopped"
  );
  CustomizableUI.removeWidgetFromArea(IPProtectionWidget.WIDGET_ID);
  // VPN should disconect when the toolbaritem is removed
  await stoppedEventPromise;
  Assert.ok(
    !BrowserTestUtils.isVisible(widget),
    "Toolbaritem is no longer visible"
  );

  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    CustomizableUI.AREA_NAVBAR,
    prevPosition
  );
});
