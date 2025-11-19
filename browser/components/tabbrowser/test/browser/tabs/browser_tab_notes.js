/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

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

/**
 *  Tab note menu tests
 */

async function openTabNoteMenu(tab) {
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  let tabNotePanel = document.getElementById("tabNotePanel");
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  tabContextMenu.activateItem(document.getElementById("context_addNote"));
  await panelShown;
  return tabNotePanel;
}

async function closeTabNoteMenu() {
  let tabNotePanel = document.getElementById("tabNotePanel");
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "hidden");
  tabNotePanel.hidePopup();
  return menuHidden;
}

add_task(async function test_openTabNotePanelFromContextMenu() {
  // open context menu with tab notes disabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", false]],
  });
  let tab = await addTab("about:blank");
  let addNoteElement = document.getElementById("context_addNote");
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    addNoteElement.hidden,
    "'Add Note' is hidden from context menu when pref disabled"
  );
  await closeContextMenu(tabContextMenu);
  await SpecialPowers.popPrefEnv();

  // open context menu with tab notes enabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    !addNoteElement.hidden,
    "'Add Note' is visible in context menu when pref enabled"
  );
  let tabNotePanel = document.getElementById("tabNotePanel");

  // open panel from context menu
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  Assert.equal(tabNotePanel.state, "closed", "Tab note panel starts hidden");
  tabContextMenu.activateItem(addNoteElement);
  await panelShown;
  Assert.equal(
    tabNotePanel.state,
    "open",
    "Tab note panel appears after clicking context menu item"
  );
  await closeTabNoteMenu();
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_dismissTabNotePanel() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });

  // Dismiss panel by pressing Esc
  let tab = await addTab("about:blank");
  let tabNoteMenu = await openTabNoteMenu(tab);
  Assert.equal(tabNoteMenu.state, "open", "Tab note menu is open");
  EventUtils.synthesizeKey("KEY_Escape");
  await BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  Assert.equal(
    tabNoteMenu.state,
    "closed",
    "Tab note menu closes after pressing Esc"
  );

  // Dismiss panel by clicking Cancel
  tabNoteMenu = await openTabNoteMenu(tab);
  Assert.equal(tabNoteMenu.state, "open", "Tab note menu is open");
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let cancelButton = document.getElementById("tab-note-editor-button-cancel");
  cancelButton.click();
  await menuHidden;
  Assert.equal(
    tabNoteMenu.state,
    "closed",
    "Tab note menu closes after clicking cancel button"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_saveTabNote() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  let tab = await addTab("about:blank");
  let tabNoteMenu = await openTabNoteMenu(tab);
  tabNoteMenu.querySelector("textarea").value = "Lorem ipsum dolor";
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  tabNoteMenu.querySelector("#tab-note-editor-button-save").click();
  await menuHidden;

  Assert.equal(gBrowser.TabNotes.get("about:blank"), "Lorem ipsum dolor");

  gBrowser.TabNotes.delete("about:blank");
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
