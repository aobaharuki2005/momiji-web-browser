/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { UrlbarProviderSearchSuggestions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/UrlbarProviderSearchSuggestions.sys.mjs"
);

const KEYWORD_ENABLED = "keyword.enabled";

add_setup(async function () {
  await Services.search.init();
});

add_task(async function test_allowRemoteSuggestions() {
  let suggestionsProvider = new UrlbarProviderSearchSuggestions();

  let context = createContext("bacon", {
    isPrivate: false,
    sapName: "urlbar",
    sources: [UrlbarUtils.RESULT_SOURCE.SEARCH],
  });
  Assert.ok(
    suggestionsProvider._allowRemoteSuggestions(context),
    "Remote suggestions should be enabled with keyword enabled"
  );

  info("Setting " + KEYWORD_ENABLED + "=false");
  Services.prefs.setBoolPref(KEYWORD_ENABLED, false);

  context = createContext("bacon", {
    isPrivate: false,
    sapName: "urlbar",
    sources: [UrlbarUtils.RESULT_SOURCE.SEARCH],
  });
  Assert.ok(
    !suggestionsProvider._allowRemoteSuggestions(context),
    "Remote suggestions should be disabled with keyword disabled"
  );

  context = createContext("bacon", {
    isPrivate: false,
    sapName: "searchbar",
    sources: [UrlbarUtils.RESULT_SOURCE.SEARCH],
  });
  Assert.ok(
    suggestionsProvider._allowRemoteSuggestions(context),
    "Remote suggestions should still be enabled on searchbar"
  );

  Services.prefs.clearUserPref(KEYWORD_ENABLED);
});
