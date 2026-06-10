/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests for disclaimer label.
 */

async function openFullScreenAIWindow() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  return { win, browser };
}

async function showDisclaimerAndGetReportHref(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const smartWindowElement = content.document.querySelector("ai-window");
    smartWindowElement.showDisclaimer = true;
    const disclaimer = await ContentTaskUtils.waitForCondition(
      () => smartWindowElement.shadowRoot?.querySelector(".disclaimer"),
      "Disclaimer should appear"
    );

    return disclaimer.querySelector('a[data-l10n-name="report-link"]').href;
  });
}

add_task(async function test_smartwindow_disclaimer_report_link() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;
  const testUrl = "https://example.com/"; // avoid hitting the network

  try {
    const href = await showDisclaimerAndGetReportHref(browser);
    Assert.ok(href, "Report link element should exist in disclaimer");
    Assert.equal(
      href,
      "https://connect.mozilla.org/t5/discussions/smart-window-beta-feedback/td-p/122365",
      "Report link should point to Mozilla Connect reporting form"
    );

    const newTabPromise = BrowserTestUtils.waitForNewTab(win.gBrowser);
    await SpecialPowers.spawn(browser, [testUrl], async url => {
      const link = content.document
        .querySelector("ai-window")
        .shadowRoot?.querySelector('a[data-l10n-name="report-link"]');
      link.href = url;
      link.click();
    });

    const newTab = await newTabPromise;
    Assert.ok(newTab, "Clicking report link should open a new tab");
    Assert.equal(
      win.gBrowser.selectedTab,
      newTab,
      "New tab should be selected (foreground tab)"
    );
    BrowserTestUtils.removeTab(newTab);
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_smartwindow_disclaimer_visibility() {
  const { win, browser } = await openFullScreenAIWindow();

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      const smartWindowElement = content.document.querySelector("ai-window");
      Assert.ok(smartWindowElement, "ai-window element should exist");

      const disclaimer =
        smartWindowElement.shadowRoot?.querySelector(".disclaimer");
      // Initially should be visible in full page mode
      Assert.strictEqual(
        disclaimer,
        null,
        "Disclaimer should NOT exist in full page mode"
      );

      // Verify disclaimer appears when showDisclaimer is true
      smartWindowElement.showDisclaimer = true;
      await ContentTaskUtils.waitForCondition(
        () => smartWindowElement.shadowRoot?.querySelector(".disclaimer"),
        "Disclaimer should appear when showDisclaimer is true"
      );

      // Verify disclaimer is removed when showDisclaimer is false
      smartWindowElement.showDisclaimer = false;
      await ContentTaskUtils.waitForCondition(
        () =>
          smartWindowElement.shadowRoot?.querySelector(".disclaimer") === null,
        "Disclaimer should be removed when showDisclaimer is false"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});
