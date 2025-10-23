/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_firefox_suggest_with_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      FirefoxSuggest: {
        WebSuggestions: false,
        SponsoredSuggestions: true,
        ImproveSuggest: true,
        Locked: true,
      },
    },
  });

  await BrowserTestUtils.withNewTab(
    "about:preferences#search",
    async browser => {
      is(
        browser.contentDocument.getElementById("firefoxSuggestNonsponsored")
          .checked,
        false,
        "Web suggestions is disabled"
      );
      is(
        browser.contentDocument.getElementById("firefoxSuggestSponsored")
          .checked,
        true,
        "Sponsored suggestions is enabled"
      );
      // TODO: The preference is enabled by default, so the new enterprise policy
      // being added in bug 1995362 should be set to false, and this check changed
      // to confirm the option is not checked.
      // is(
      //   browser.contentDocument.getElementById(
      //     "firefoxSuggestOnlineEnabledToggle"
      //   ).checked,
      //   true,
      //   "Suggest online is enabled"
      // );
      is(
        browser.contentDocument.getElementById("firefoxSuggestNonsponsored")
          .disabled,
        true,
        "Web suggestions is disabled"
      );
      is(
        browser.contentDocument.getElementById("firefoxSuggestSponsored")
          .disabled,
        true,
        "Sponsored suggestions is disabled"
      );
      // TODO: Bug 1995362 - This needs the new enterprise policy to be hooked
      // up.
      // is(
      //   browser.contentDocument.getElementById(
      //     "firefoxSuggestOnlineEnabledToggle"
      //   ).disabled,
      //   true,
      //   "Suggest online is disabled"
      // );
    }
  );
});
