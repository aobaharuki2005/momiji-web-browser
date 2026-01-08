"use strict";

const PAGE_PREFS = "about:preferences";
const PAGE_PRIVACY = PAGE_PREFS + "#privacy";

const DIALOG_SIZE = "width=600,height=400";

const SELECTORS_DIALOG = {
  records: "#addresses",
  add: "#add",
  edit: "#edit",
  remove: "#remove",
};

const SELECTORS_SUBPAGE = {
  records: "#address-item",
  add: "#add-address-button",
  edit: "#edit-address-button",
  remove: "#delete-address-button",
};

const TEST_ADDRESSES = [
  TEST_ADDRESS_1,
  TEST_ADDRESS_2,
  TEST_ADDRESS_3,
  TEST_ADDRESS_4,
  TEST_ADDRESS_5,
];

async function clearAddresses() {
  await removeAllRecords();
}

async function addAddresses(addresses) {
  for (let address of addresses) {
    await setStorage(address);
  }
}

async function withAddressDialog(taskFn) {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", false]],
  });

  let win = window.openDialog(MANAGE_ADDRESSES_DIALOG_URL);
  await waitForFocusAndFormReady(win);
  try {
    await taskFn(win);
  } finally {
    win.close();
  }
}

async function withAddressSubpage(taskFn) {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });

  let finalPrefPaneLoaded = TestUtils.topicObserved("sync-pane-loaded");

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_PRIVACY },
    async browser => {
      await finalPrefPaneLoaded;

      await SpecialPowers.spawn(browser, [], async () => {
        info("Opening Saved Addresses subpage");

        const savedAddressesBtn = content.document.querySelector(
          "#savedAddressesButton"
        );
        ok(savedAddressesBtn, "Saved Addresses button exists");
        savedAddressesBtn.click();

        const addressesPage = content.document.querySelector(
          '[data-category="paneManageAddresses"]'
        );
        ok(addressesPage, "Manage Addresses page exists");

        await ContentTaskUtils.waitForCondition(
          () => !addressesPage.hidden,
          "Manage addresses subpage did not become visible"
        );

        ok(true, "Manage addresses subpage is visible");
      });

      await taskFn(browser);
    }
  );
}

add_task(async function test_dialogInitialState() {
  await clearAddresses();

  await withAddressDialog(async win => {
    const doc = win.document;
    const records = doc.querySelector(SELECTORS_DIALOG.records);
    const btnAdd = doc.querySelector(SELECTORS_DIALOG.add);
    const btnEdit = doc.querySelector(SELECTORS_DIALOG.edit);
    const btnRemove = doc.querySelector(SELECTORS_DIALOG.remove);

    is(records.length, 0, "No addresses initially");
    ok(!btnAdd.disabled, "Add enabled");
    ok(btnEdit.disabled, "Edit disabled");
    ok(btnRemove.disabled, "Remove disabled");
  });
});

add_task(async function test_dialogStorageObserver() {
  await clearAddresses();

  await withAddressDialog(async win => {
    const records = win.document.querySelector(SELECTORS_DIALOG.records);

    await setStorage(TEST_ADDRESS_1);
    await BrowserTestUtils.waitForEvent(records, "RecordsLoaded");
    is(records.length, 1, "Address added");

    await removeAddresses([records.options[0].value]);
    await BrowserTestUtils.waitForEvent(records, "RecordsLoaded");
    is(records.length, 0, "Address removed");
  });
});

add_task(async function test_subpageInitialState() {
  await clearAddresses();
  await withAddressSubpage(async browser => {
    await SpecialPowers.spawn(browser, [SELECTORS_SUBPAGE], selectors => {
      const records = content.document.querySelectorAll(selectors.records);
      const btnAdd = content.document.querySelector(selectors.add);
      const editBtns = content.document.querySelectorAll(selectors.edit);
      const deleteBtns = content.document.querySelectorAll(selectors.remove);

      is(records.length, 0, "No addresses initially");
      ok(!btnAdd.disabled, "Add enabled");
      is(
        editBtns.length,
        0,
        "No edit buttons present since no addresses initially"
      );
      is(
        deleteBtns.length,
        0,
        "No delete buttons present since no addresses initially"
      );
    });
  });
});

add_task(async function test_subpageStorageObserver() {
  await clearAddresses();

  await withAddressSubpage(async browser => {
    await setStorage(TEST_ADDRESS_1);

    await SpecialPowers.spawn(browser, [SELECTORS_SUBPAGE], async selectors => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelectorAll(selectors.records).length === 1,
        "Address did not appear"
      );

      ok(true, "Address appeared");
    });
  });
});

add_task(async function test_subpageEditButtonOpensEditor() {
  await clearAddresses();
  await addAddresses([TEST_ADDRESS_1]);

  await withAddressSubpage(async browser => {
    await SpecialPowers.spawn(browser, [SELECTORS_SUBPAGE], async selectors => {
      const edit = content.document.querySelector(selectors.edit);
      edit.click();

      const dialog = content.document.querySelector(".dialogBox");
      await ContentTaskUtils.waitForCondition(
        () => !dialog.hidden,
        "Edit dialog did not open"
      );

      ok(true, "Edit address dialog opened");
    });
  });
});
