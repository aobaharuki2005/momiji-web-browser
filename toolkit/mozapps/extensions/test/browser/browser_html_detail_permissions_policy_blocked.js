/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

AddonTestUtils.initMochitest(this);

async function verifyBlockedToggleUI(id, policy) {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson(policy);

  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id } },
      name: "Policy blocked toggle test",
      optional_permissions: ["history", "tabs"],
    },
    useAddonManager: "permanent",
  });
  await extension.startup();

  let view = await loadInitialView("extension");
  let card = getAddonCard(view, id);

  if (!card.querySelector("addon-permissions-list")) {
    let loaded = waitForViewLoad(view);
    card.querySelector('[action="expand"]').click();
    await loaded;
    card = getAddonCard(view, id);
  }

  let { deck, tabGroup } = card.details;
  let permsBtn = tabGroup.querySelector('[name="permissions"]');
  let permsShown = BrowserTestUtils.waitForEvent(deck, "view-changed");
  permsBtn.click();
  await permsShown;

  let permsSection = card.querySelector("addon-permissions-list");
  let toggles = permsSection.querySelectorAll(
    '.addon-permissions-optional moz-toggle[permission-type="permission"]'
  );

  let historyToggle = Array.from(toggles).find(
    t => t.getAttribute("permission-key") === "history"
  );
  let tabsToggle = Array.from(toggles).find(
    t => t.getAttribute("permission-key") === "tabs"
  );

  ok(historyToggle, "history toggle exists");
  ok(tabsToggle, "tabs toggle exists");
  ok(
    historyToggle.disabled,
    "Blocked permission toggle should be disabled by policy"
  );
  ok(
    !tabsToggle.disabled,
    "Non-blocked permission toggle should remain enabled"
  );

  let banner = permsSection.querySelector(".addon-permissions-policy-banner");
  ok(banner, "Policy banner is rendered when any optional perm is blocked");
  is(
    banner.supportLinkEls[0]?.getAttribute("support-page"),
    "managed-browser-firefox#w_why-some-features-may-be-disabled",
    "Banner link points to the managed-browser SUMO page"
  );

  await closeView(view);
  await extension.unload();
  await EnterprisePolicyTesting.setupPolicyEngineWithJson("");
}

add_task(async function test_blocked_permission_toggle_global() {
  await verifyBlockedToggleUI("policy-blocked-toggle-global@mochi.test", {
    policies: {
      ExtensionSettings: { "*": { blocked_permissions: ["history"] } },
    },
  });
});

add_task(async function test_blocked_permission_toggle_per_id() {
  const id = "policy-blocked-toggle-per-id@mochi.test";
  await verifyBlockedToggleUI(id, {
    policies: {
      ExtensionSettings: { [id]: { blocked_permissions: ["history"] } },
    },
  });
});
