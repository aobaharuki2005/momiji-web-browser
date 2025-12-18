/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

registerCleanupFunction(async () => {
  await TabNotes.reset();
});

/**
 *  Tab note menu tests
 */

/**
 * @param {Node} triggerNode
 * @param {string} contextMenuId
 * @returns {Promise<XULMenuElement|XULPopupElement>}
 */
async function getContextMenu(triggerNode, contextMenuId) {
  let win = triggerNode.ownerGlobal;
  triggerNode.scrollIntoView({ behavior: "instant" });
  const contextMenu = win.document.getElementById(contextMenuId);
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    triggerNode,
    { type: "contextmenu", button: 2 },
    win
  );
  await contextMenuShown;
  return contextMenu;
}

let activateTabContextMenuItem = async (
  selectedTab,
  menuItemSelector,
  submenuItemSelector
) => {
  let submenuItem;
  let submenuItemHiddenPromise;

  const win = selectedTab.ownerGlobal;
  const tabContextMenu = win.document.getElementById("tabContextMenu");
  const contextMenuShown = BrowserTestUtils.waitForEvent(
    tabContextMenu,
    "popupshown",
    false,
    ev => ev.target == tabContextMenu
  );
  EventUtils.synthesizeMouseAtCenter(
    selectedTab,
    { type: "contextmenu", button: 2 },
    win
  );
  await contextMenuShown;

  if (submenuItemSelector) {
    submenuItem = tabContextMenu.querySelector(submenuItemSelector);

    const submenuPopupPromise = BrowserTestUtils.waitForEvent(
      submenuItem.menupopup,
      "popupshown"
    );
    submenuItem.openMenu(true);
    await submenuPopupPromise;

    submenuItemHiddenPromise = BrowserTestUtils.waitForEvent(
      submenuItem.menupopup,
      "popuphidden"
    );
  }

  const contextMenuHidden = BrowserTestUtils.waitForEvent(
    tabContextMenu,
    "popuphidden",
    false,
    ev => ev.target == tabContextMenu
  );
  tabContextMenu.activateItem(tabContextMenu.querySelector(menuItemSelector));
  await contextMenuHidden;
  if (submenuItemSelector) {
    await submenuItemHiddenPromise;
  }
};

/**
 * @param {XULMenuElement|XULPopupElement} contextMenu
 * @returns {Promise<void>}
 */
async function closeContextMenu(contextMenu) {
  let menuHidden = BrowserTestUtils.waitForPopupEvent(contextMenu, "hidden");
  contextMenu.hidePopup();
  await menuHidden;
}

async function openTabNoteMenuByAddNote(tab) {
  let tabNotePanel = document.getElementById("tabNotePanel");
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  activateTabContextMenuItem(tab, "#context_addNote");
  await panelShown;
  return tabNotePanel;
}

async function openTabNoteMenuByEditNote(tab) {
  let tabNotePanel = document.getElementById("tabNotePanel");
  let panelShown = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "shown");
  activateTabContextMenuItem(tab, "#context_editNote", "#context_updateNote");
  await panelShown;
  return tabNotePanel;
}

async function closeTabNoteMenu() {
  let tabNotePanel = document.getElementById("tabNotePanel");
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNotePanel, "hidden");
  tabNotePanel.hidePopup();
  return menuHidden;
}

add_task(async function test_tabContextMenu_prefDisabled() {
  // open context menu with tab notes disabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", false]],
  });
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let addNoteElement = document.getElementById("context_addNote");
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    addNoteElement.hidden,
    "'Add Note' is hidden from context menu when pref disabled"
  );
  await closeContextMenu(tabContextMenu);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_openTabNotePanelFromContextMenu() {
  // open context menu with tab notes enabled
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let addNoteElement = document.getElementById("context_addNote");
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
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
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteMenu = await openTabNoteMenuByAddNote(tab);
  Assert.equal(tabNoteMenu.state, "open", "Tab note menu is open");
  EventUtils.synthesizeKey("KEY_Escape");
  await BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  Assert.equal(
    tabNoteMenu.state,
    "closed",
    "Tab note menu closes after pressing Esc"
  );

  // Dismiss panel by clicking Cancel
  tabNoteMenu = await openTabNoteMenuByAddNote(tab);
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
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteMenu = await openTabNoteMenuByAddNote(tab);
  tabNoteMenu.querySelector("textarea").value = "Lorem ipsum dolor";
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let tabNoteCreated = BrowserTestUtils.waitForEvent(tab, "TabNote:Created");
  tabNoteMenu.querySelector("#tab-note-editor-button-save").click();
  await Promise.all([menuHidden, tabNoteCreated]);

  const tabNote = await TabNotes.get(tab);
  Assert.equal(
    tabNote.text,
    "Lorem ipsum dolor",
    "the text entered into the textarea should have been saved as a note"
  );

  await TabNotes.delete(tab);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_editTabNote() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });

  let initialNoteValue = "Lorem ipsum dolor";

  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteCreated = BrowserTestUtils.waitForEvent(tab, "TabNote:Created");
  await TabNotes.set(tab, initialNoteValue);
  await tabNoteCreated;

  let tabNoteMenu = await openTabNoteMenuByEditNote(tab);
  Assert.equal(
    tabNoteMenu.querySelector("textarea").value,
    initialNoteValue,
    "Tab note panel has initial note value in textarea"
  );

  let updatedNoteValue = initialNoteValue + " sit amet";

  tabNoteMenu.querySelector("textarea").value = updatedNoteValue;
  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let tabNoteEdited = BrowserTestUtils.waitForEvent(tab, "TabNote:Edited");
  tabNoteMenu.querySelector("#tab-note-editor-button-save").click();
  await Promise.all([menuHidden, tabNoteEdited]);

  const tabNote = await TabNotes.get(tab);
  Assert.equal(
    tabNote.text,
    updatedNoteValue,
    "The updated text entered into the textarea was saved as a note"
  );

  await TabNotes.delete(tab);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_deleteTabNote() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });

  let initialNoteValue = "Lorem ipsum dolor";

  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteCreated = BrowserTestUtils.waitForEvent(tab, "TabNote:Created");
  await TabNotes.set(tab, initialNoteValue);
  await tabNoteCreated;

  let tabNoteRemoved = BrowserTestUtils.waitForEvent(tab, "TabNote:Removed");
  activateTabContextMenuItem(tab, "#context_deleteNote", "#context_updateNote");
  await tabNoteRemoved;

  let result = await TabNotes.has(tab);

  Assert.ok(!result, "Tab note was deleted");

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
