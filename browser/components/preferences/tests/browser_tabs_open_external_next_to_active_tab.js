/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PREF_NAME = "browser.link.open_newwindow.override.external";
const PREF_VALUE_FEATURE_OFF = Ci.nsIBrowserDOMWindow.OPEN_NEWTAB_BACKGROUND;
const PREF_VALUE_FEATURE_ON = Ci.nsIBrowserDOMWindow.OPEN_NEWTAB_AFTER_CURRENT;

add_task(async function test_open_external_link_next_to_active_tab_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NAME, PREF_VALUE_FEATURE_OFF]],
  });

  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });

  const doc = gBrowser.contentDocument;
  const checkbox = doc.getElementById("openAppLinksNextToActiveTab");

  info("validate default starting conditions");
  Assert.ok(checkbox, "pref should have a checkbox");
  Assert.ok(
    !checkbox.checked,
    "pref checkbox should not be checked by default"
  );

  info(
    "validate checking and unchecking the pref checkbox under default conditions"
  );
  let becameChecked = BrowserTestUtils.waitForAttribute("checked", checkbox);
  checkbox.click();
  await becameChecked;

  Assert.equal(
    Services.prefs.getIntPref(PREF_NAME),
    PREF_VALUE_FEATURE_ON,
    "pref should be set to open external links after the active tab"
  );

  let becameUnchecked = BrowserTestUtils.waitForAttributeRemoval(
    "checked",
    checkbox
  );
  checkbox.click();
  await becameUnchecked;

  Assert.ok(
    !Services.prefs.prefHasUserValue(PREF_NAME),
    "pref should have been reverted to its default value"
  );

  await SpecialPowers.popPrefEnv();
  BrowserTestUtils.removeTab(gBrowser.selectedTab, { animate: false });
});
