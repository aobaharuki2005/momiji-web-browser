/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });

  registerCleanupFunction(async function () {
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function tabNotesBasicStorageTests() {
  let url = "https://example.com/abc";
  let value = "some note";

  let result = gBrowser.TabNotes.set(url, value);
  Assert.equal(result, value, "TabNotes.set returns note value");

  Assert.equal(
    gBrowser.TabNotes.has(url),
    true,
    "TabNotes.has indicates that URL has a note"
  );

  Assert.equal(
    gBrowser.TabNotes.get(url),
    value,
    "TabNotes.get returns previously set note value"
  );

  let fgWindow = await BrowserTestUtils.openNewBrowserWindow();
  Assert.equal(
    fgWindow.gBrowser.TabNotes.get(url),
    value,
    "TabNotes.get returns previously set note value from any window"
  );
  await BrowserTestUtils.closeWindow(fgWindow);

  gBrowser.TabNotes.delete(url);

  Assert.equal(
    gBrowser.TabNotes.has(url),
    false,
    "TabNotes.has indicates that the deleted URL no longer has a note"
  );

  Assert.equal(
    gBrowser.TabNotes.get(url),
    undefined,
    "TabNotes.get returns undefined for URL that does not have a note"
  );

  gBrowser.TabNotes.reset();
});

add_task(async function tabNotesSanitizationTests() {
  let url = "https://example.com/";
  let tooLongValue = "x".repeat(1500);
  let correctValue = "x".repeat(1000);

  gBrowser.TabNotes.set(url, tooLongValue);
  let result = gBrowser.TabNotes.get(url);

  Assert.equal(result, correctValue, "TabNotes.set truncates note length");
});
