/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

loadTestSubscript("head_unified_extensions.js");

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
//
// The scenario of there being an extension with private access is covered by
// test_list_active_extensions_only in browser_unified_extensions.js.
add_task(async function test_button_click_in_pbm_without_private_extensions() {
  const extensions = createExtensions([{ name: "Without private access" }]);
  await Promise.all(extensions.map(extension => extension.startup()));

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

  await Promise.all(extensions.map(extension => extension.unload()));
});
