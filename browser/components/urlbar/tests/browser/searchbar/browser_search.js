/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CANONIZE_MODIFIERS =
  AppConstants.platform == "macosx" ? { metaKey: true } : { ctrlKey: true };

let searchbar = document.getElementById("searchbar-new");
let defaultEngine;

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine" }]);
  defaultEngine = Services.search.defaultEngine;
});

add_task(async function test_simple() {
  let searchTerm = "test";
  searchbar.focus();
  EventUtils.sendString(searchTerm);
  EventUtils.synthesizeKey("KEY_Enter");
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;
  Assert.equal(gBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");
  searchbar.value = "";
});

add_task(async function test_no_canonization() {
  let searchTerm = "test2";
  searchbar.focus();
  EventUtils.sendString(searchTerm);
  EventUtils.synthesizeKey("KEY_Enter", CANONIZE_MODIFIERS);
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;
  Assert.equal(gBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");
  searchbar.value = "";
});
