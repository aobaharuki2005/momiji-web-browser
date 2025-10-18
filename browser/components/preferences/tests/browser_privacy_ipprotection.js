/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

// This file tests the Privacy pane's Firefox VPN UI.

"use strict";

const FEATURE_PREF = "browser.ipProtection.variant";

const SECTION_ID = "dataIPProtectionGroup";

// Test the section is hidden on page load if the variant pref is set to an ineligible experiment.
add_task(
  async function test_section_removed_when_set_to_ineligible_experiment_pref() {
    await SpecialPowers.pushPrefEnv({
      set: [[FEATURE_PREF, "alpha"]],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        let section = browser.contentDocument.getElementById(SECTION_ID);
        is_element_hidden(section, "#dataIPProtectionGroup is hidden");
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);

// Test the section is shown on page load if the variant pref is set to an eligible experiment
add_task(
  async function test_section_shown_when_set_to_eligible_experiment_pref() {
    await SpecialPowers.pushPrefEnv({
      set: [[FEATURE_PREF, "beta"]],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: "about:preferences#privacy" },
      async function (browser) {
        let section = browser.contentDocument.getElementById(SECTION_ID);
        is_element_visible(section, "#dataIPProtectionGroup is shown");
      }
    );

    await SpecialPowers.popPrefEnv();
  }
);
