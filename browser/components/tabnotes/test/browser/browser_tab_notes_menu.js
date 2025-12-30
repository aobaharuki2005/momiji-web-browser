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
  let updateNoteElement = document.getElementById("context_updateNote");
  let tabContextMenu = await getContextMenu(tab, "tabContextMenu");
  Assert.ok(
    addNoteElement.hidden,
    "'Add Note' is hidden from context menu when pref disabled"
  );
  Assert.ok(
    updateNoteElement.hidden,
    "'Update Note' is hidden from context menu when pref disabled"
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
  let tabNoteInput = tabNoteMenu.querySelector("textarea");
  tabNoteInput.focus();
  EventUtils.sendString("Lorem ipsum dolor", window);

  let saveButton = tabNoteMenu.querySelector("#tab-note-editor-button-save");
  await BrowserTestUtils.waitForCondition(() => {
    return !saveButton.disabled;
  });

  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let tabNoteCreated = BrowserTestUtils.waitForEvent(tab, "TabNote:Created");
  saveButton.click();
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

  let updatedNoteValue = " sit amet";

  let tabNoteInput = tabNoteMenu.querySelector("textarea");
  tabNoteInput.focus();
  EventUtils.sendString(updatedNoteValue, window);

  let saveButton = tabNoteMenu.querySelector("#tab-note-editor-button-save");
  await BrowserTestUtils.waitForCondition(() => {
    return !saveButton.disabled;
  });

  let menuHidden = BrowserTestUtils.waitForPopupEvent(tabNoteMenu, "hidden");
  let tabNoteEdited = BrowserTestUtils.waitForEvent(tab, "TabNote:Edited");
  tabNoteMenu.querySelector("#tab-note-editor-button-save").click();
  await Promise.all([menuHidden, tabNoteEdited]);

  const tabNote = await TabNotes.get(tab);
  Assert.equal(
    tabNote.text,
    initialNoteValue + updatedNoteValue,
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
});

add_task(async function test_tabNoteOverflow() {
  let tab = BrowserTestUtils.addTab(gBrowser, "https://www.example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let tabNoteMenu = await openTabNoteMenuByAddNote(tab);
  let saveButton = tabNoteMenu.querySelector("#tab-note-editor-button-save");

  Assert.ok(
    !tabNoteMenu.hasAttribute("overflow"),
    "Sanity check: tab note menu overflow is false"
  );

  let textarea = tabNoteMenu.querySelector("textarea");
  textarea.focus();
  EventUtils.sendString("x".repeat(990));

  Assert.equal(
    tabNoteMenu.getAttribute("overflow"),
    "warn",
    "Tab note overflow warning indicator is set"
  );
  Assert.ok(
    !saveButton.disabled,
    "Save button is not disabled when warning indicator is active"
  );

  textarea.focus();
  EventUtils.sendString("x".repeat(100));

  Assert.equal(
    tabNoteMenu.getAttribute("overflow"),
    "overflow",
    "Tab note overflow indicator is set"
  );
  Assert.ok(
    saveButton.disabled,
    "Save button is disabled when overflow indicator is active"
  );

  await closeTabNoteMenu();
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_ineligibleTabsDisableMenus() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.notes.enabled", true]],
  });

  let tabContextMenu = document.getElementById("tabContextMenu");
  let addNoteEntry = document.querySelector("#context_addNote");
  let updateNoteEntry = document.querySelector("#context_updateNote");

  let eligibleTab = BrowserTestUtils.addTab(
    gBrowser,
    "https://www.example.com"
  );
  await BrowserTestUtils.browserLoaded(eligibleTab.linkedBrowser);

  let ineligibleTab = BrowserTestUtils.addTab(gBrowser, "about:logo");
  await BrowserTestUtils.browserLoaded(ineligibleTab.linkedBrowser);

  info(
    "Test that an eligible tab without a note has an enabled 'Add Note' entry"
  );
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    !addNoteEntry.hasAttribute("disabled"),
    "Eligible tab has enabled 'Add Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  info("Test that an ineligible tab has a disabled 'Add Note' entry");
  await getContextMenu(ineligibleTab, "tabContextMenu");
  Assert.ok(
    addNoteEntry.hasAttribute("disabled"),
    "Ineligible tab has disabled 'Add Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  info(
    "Test that a multiselection with at least one ineligible tab has a disabled 'Add Note' entry"
  );
  gBrowser.selectedTabs = [eligibleTab, ineligibleTab];
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    addNoteEntry.hasAttribute("disabled"),
    "Multiselection with an ineligible tab has disabled 'Add Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  let eligibleSameCanonicalUrl = BrowserTestUtils.addTab(
    gBrowser,
    "https://www.example.com"
  );
  await BrowserTestUtils.browserLoaded(eligibleSameCanonicalUrl.linkedBrowser);
  let eligibleDifferentCanonicalUrl = BrowserTestUtils.addTab(
    gBrowser,
    "https://www.example.com/abc"
  );
  await BrowserTestUtils.browserLoaded(
    eligibleDifferentCanonicalUrl.linkedBrowser
  );

  info(
    "Test that a multiselection with two tabs with the same canonical URL and no note has an enabled 'Add Note' entry"
  );
  gBrowser.selectedTabs = [eligibleTab, eligibleSameCanonicalUrl];
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    !addNoteEntry.hasAttribute("disabled"),
    "Multiselection with two same canonical URLs has enabled 'Add Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  info(
    "Test that a multiselection with two tabs with different canonical URLs has a disabled 'Add Note' entry"
  );
  gBrowser.selectedTabs = [eligibleTab, eligibleDifferentCanonicalUrl];
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    addNoteEntry.hasAttribute("disabled"),
    "Multiselection with two different canonical URLs has disabled 'Add Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  info(
    "Test that an eligible tab with a note has an enabled 'Update Note' entry"
  );
  gBrowser.selectedTabs = [eligibleTab];
  await TabNotes.set(eligibleTab, "Some tab note");
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    !updateNoteEntry.hasAttribute("disabled"),
    "Eligible tab has enabled 'Update Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  info(
    "Test that a multiselection with a tab with a note and an ineligible tab has a disabled 'Update Note' entry"
  );
  gBrowser.selectedTabs = [eligibleTab, ineligibleTab];
  await getContextMenu(eligibleTab, "tabContextMenu");
  Assert.ok(
    updateNoteEntry.hasAttribute("disabled"),
    "Multiselection with a tab with note and ineligible tab has disabled 'Update Note' entry"
  );
  await closeContextMenu(tabContextMenu);

  BrowserTestUtils.removeTab(eligibleTab);
  BrowserTestUtils.removeTab(ineligibleTab);
  BrowserTestUtils.removeTab(eligibleSameCanonicalUrl);
  BrowserTestUtils.removeTab(eligibleDifferentCanonicalUrl);
  await SpecialPowers.popPrefEnv();
});
