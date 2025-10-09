/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
AddonTestUtils.initMochitest(this);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

loadTestSubscript("head_unified_extensions.js");

// The createExtensions helper (using ExtensionTestUtils.loadExtension) does
// not support disabled add-ons. This helper uses AOM directly instead.
async function promiseInstallWebExtension(extensionData) {
  let addonFile = AddonTestUtils.createTempWebExtensionFile(extensionData);
  let { addon } = await AddonTestUtils.promiseInstallFile(addonFile);
  return addon;
}

add_setup(async function () {
  // Make sure extension buttons added to the navbar will not overflow in the
  // panel, which could happen when a previous test file resizes the current
  // window.
  await ensureMaximizedWindow(window);

  const sandbox = sinon.createSandbox();
  registerCleanupFunction(() => sandbox.restore());

  // The test harness registers test extensions which affects the rendered
  // button and panel. This matters especially for tests that want to verify
  // the behavior when there are no extensions to render in the list.
  // Temporarily fake-hide these extensions to ensure that we start with zero
  // extensions from the test's POV.
  function fakeHideExtension(extensionId) {
    const { extension } = WebExtensionPolicy.getByID(extensionId);
    // This shadows ExtensionData.isHidden of the Extension subclass, causing
    // gUnifiedExtensions.getActivePolicies() to ignore the extension.
    sandbox.stub(extension, "isHidden").get(() => true);
  }
  fakeHideExtension("mochikit@mozilla.org");
  fakeHideExtension("special-powers@mozilla.org");
});

function getEmptyStateContainer(win) {
  let emptyStateBox = win.gUnifiedExtensions.panel.querySelector(
    "#unified-extensions-empty-state"
  );
  ok(emptyStateBox, "Got container for empty panel state");
  return emptyStateBox;
}

add_task(async function test_button_opens_discopane_when_no_extension() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:robots" },
    async () => {
      const { button } = gUnifiedExtensions;
      ok(button, "expected button");

      // Primary click should open about:addons.
      const tabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        "about:addons",
        true
      );

      button.click();

      const tab = await tabPromise;
      is(
        gBrowser.currentURI.spec,
        "about:addons",
        "expected about:addons to be open"
      );
      is(
        gBrowser.selectedBrowser.contentWindow.gViewController.currentViewId,
        "addons://discover/",
        "expected about:addons to show the recommendations"
      );
      BrowserTestUtils.removeTab(tab);

      // "Right-click" should open the context menu only.
      const contextMenu = document.getElementById("toolbar-context-menu");
      const popupShownPromise = BrowserTestUtils.waitForEvent(
        contextMenu,
        "popupshown"
      );
      EventUtils.synthesizeMouseAtCenter(button, {
        type: "contextmenu",
        button: 2,
      });
      await popupShownPromise;
      await closeChromeContextMenu(contextMenu.id, null);
    }
  );
});

add_task(
  async function test_button_opens_extlist_when_no_extension_and_pane_disabled() {
    // If extensions.getAddons.showPane is set to false, there is no "Recommended" tab,
    // so we need to make sure we don't navigate to it.

    await SpecialPowers.pushPrefEnv({
      set: [
        // Set this to another value to make sure not to "accidentally" land on the right page
        ["extensions.ui.lastCategory", "addons://list/theme"],
        ["extensions.getAddons.showPane", false],
      ],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:robots" },
      async () => {
        const { button } = gUnifiedExtensions;
        ok(button, "expected button");

        // Primary click should open about:addons.
        const tabPromise = BrowserTestUtils.waitForNewTab(
          gBrowser,
          "about:addons",
          true
        );

        button.click();

        const tab = await tabPromise;
        is(
          gBrowser.currentURI.spec,
          "about:addons",
          "expected about:addons to be open"
        );
        is(
          gBrowser.selectedBrowser.contentWindow.gViewController.currentViewId,
          "addons://list/extension",
          "expected about:addons to show the extension list"
        );
        BrowserTestUtils.removeTab(tab);
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_button_click_in_pbm_without_any_extensions() {
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  // Button click opens about:addons (reuses about:privatebrowsing tab).
  // Primary click should open about:addons.
  const tabLoadedPromise = BrowserTestUtils.browserStopped(
    win.gBrowser.selectedBrowser,
    "about:addons"
  );

  win.gUnifiedExtensions.button.click();

  await tabLoadedPromise;
  is(
    win.gBrowser.currentURI.spec,
    "about:addons",
    "expected about:addons to be open"
  );

  // This also closes the new tab.
  await BrowserTestUtils.closeWindow(win);
});

// Tests behavior when the user has extensions installed, but without private
// browsing access. Extensions without private browsing access are not shown,
// and if this was the only extension, then there is no extension to show.
// Instead, a message notifying the user about extensions without private
// access is shown instead.
//
// The scenario of there being an extension with private access is covered by
// test_empty_state_is_hidden_when_panel_is_non_empty below, and by
// test_list_active_extensions_only in browser_unified_extensions.js.
add_task(async function test_button_click_in_pbm_without_private_extensions() {
  const extensions = createExtensions([{ name: "Without private access" }]);
  await Promise.all(extensions.map(extension => extension.startup()));

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  // This clicks on gUnifiedExtensions.button and waits for panel to show.
  await openExtensionsPanel(win);

  let emptyStateBox = getEmptyStateContainer(win);
  ok(BrowserTestUtils.isVisible(emptyStateBox), "Empty state is visible");
  is(
    emptyStateBox.querySelector("h2").getAttribute("data-l10n-id"),
    "unified-extensions-empty-reason-private-browsing-not-allowed",
    "Has header 'You have extensions installed, but not enabled in private windows'"
  );
  is(
    emptyStateBox.querySelector("description").getAttribute("data-l10n-id"),
    "unified-extensions-empty-content-explain-enable",
    "Has description pointing to Manage extensions button."
  );

  await BrowserTestUtils.closeWindow(win);

  await Promise.all(extensions.map(extension => extension.unload()));
});

// In contrast to the above test_button_click_in_pbm_without_private_extensions
// test, this test shows that the empty panel with the private browsing message
// is hidden when there is an extension shown in the private window.
add_task(async function test_empty_state_is_hidden_when_panel_is_non_empty() {
  const extensions = [
    ...createExtensions([{ name: "Without private access" }]),
    ...createExtensions(
      [
        {
          name: "Ext with private browsing access",
          browser_specific_settings: { gecko: { id: "@ext-with-pbm-access" } },
        },
      ],
      { incognitoOverride: "spanning" }
    ),
  ];
  await Promise.all(extensions.map(extension => extension.startup()));

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  // This clicks on gUnifiedExtensions.button and waits for panel to show.
  await openExtensionsPanel(win);

  let emptyStateBox = getEmptyStateContainer(win);
  ok(BrowserTestUtils.isHidden(emptyStateBox), "Empty state is hidden");

  // Sanity check: the second extension with PBM access is rendered (which is
  // the reason that the empty state is hidden).
  ok(
    getUnifiedExtensionsItem(extensions[1].id, win),
    "Found extension with access to PBM in panel in private window"
  );

  await BrowserTestUtils.closeWindow(win);

  await Promise.all(extensions.map(extension => extension.unload()));
});

// Verify the behavior when there is an extension with private access but is
// pinned, and an extension without private access.
add_task(async function test_button_click_in_pbm_pinned_and_no_access() {
  const extensions = [
    ...createExtensions([{ name: "Without private access" }]),
    ...createExtensions(
      [
        {
          name: "Pinned ext with private browsing access",
          browser_action: {
            default_area: "navbar", // Pin outside extensions panel.
          },
          browser_specific_settings: { gecko: { id: "@pin-with-pbm-access" } },
        },
      ],
      { incognitoOverride: "spanning" }
    ),
  ];
  await Promise.all(extensions.map(extension => extension.startup()));
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  // This clicks on gUnifiedExtensions.button and waits for panel to show.
  await openExtensionsPanel(win);

  let emptyStateBox = getEmptyStateContainer(win);
  ok(BrowserTestUtils.isVisible(emptyStateBox), "Empty state is visible");
  is(
    emptyStateBox.querySelector("h2").getAttribute("data-l10n-id"),
    "unified-extensions-empty-reason-private-browsing-not-allowed",
    "Has header 'You have extensions installed, but not enabled in private windows'"
  );
  is(
    emptyStateBox.querySelector("description").getAttribute("data-l10n-id"),
    "unified-extensions-empty-content-explain-enable",
    "Has description pointing to Manage extensions button."
  );

  await BrowserTestUtils.closeWindow(win);

  await Promise.all(extensions.map(extension => extension.unload()));
});

add_task(async function test_empty_state_with_disabled_addon() {
  const [extension] = createExtensions([{ name: "The Only Extension" }]);
  await extension.startup();
  const addon = await AddonManager.getAddonByID(extension.id);
  await addon.disable();

  const win = await BrowserTestUtils.openNewBrowserWindow();

  // This clicks on gUnifiedExtensions.button and waits for panel to show.
  await openExtensionsPanel(win);

  let emptyStateBox = getEmptyStateContainer(win);
  ok(BrowserTestUtils.isVisible(emptyStateBox), "Empty state is visible");
  is(
    emptyStateBox.querySelector("h2").getAttribute("data-l10n-id"),
    "unified-extensions-empty-reason-extension-not-enabled",
    "Has header 'You have extensions installed, but not enabled'"
  );
  is(
    emptyStateBox.querySelector("description").getAttribute("data-l10n-id"),
    "unified-extensions-empty-content-explain-enable",
    "Has description pointing to Manage extensions button."
  );

  await BrowserTestUtils.closeWindow(win);

  await extension.unload();
});

// This test shows that non-extension add-ons are ignored in evaluating whether
// the empty panel should be shown, even if there is another reason that could
// potentially match for extension types (e.g. add-on being disabled).
add_task(async function test_no_empty_state_with_disabled_non_extension() {
  const disabledDictAddon = await promiseInstallWebExtension({
    manifest: {
      name: "This is a dictionary (definitely not type 'extension') (disabled)",
      dictionaries: {},
      browser_specific_settings: { gecko: { id: "@dict-disabled" } },
    },
  });
  const dictAddon = await promiseInstallWebExtension({
    manifest: {
      name: "This is a dictionary (definitely not type 'extension') (enabled)",
      dictionaries: {},
      browser_specific_settings: { gecko: { id: "@dict-not-disabled" } },
    },
  });
  await disabledDictAddon.disable();
  is(disabledDictAddon.isActive, false, "One of the dict add-ons was disabled");

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:robots" },
    async () => {
      // Primary click should open about:addons. Notably, the extensions panel
      // and "You have extensions installed, but not enabled" is not shown.
      const tabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        "about:addons",
        true
      );

      gUnifiedExtensions.button.click();

      const tab = await tabPromise;
      ok(true, "about:addons opened instead of panel about disabled add-ons");
      BrowserTestUtils.removeTab(tab);
    }
  );

  await disabledDictAddon.uninstall();
  await dictAddon.uninstall();
});
