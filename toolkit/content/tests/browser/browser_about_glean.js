/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["test.wait300msAfterTabSwitch", true]],
  });
});

add_task(async function test_about_glean_redesign_views_hidden_behind_pref() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("about.glean.redesign.enabled");
  });

  await BrowserTestUtils.withNewTab("about:glean", async function (browser) {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async function () {
      let metrics_table_category_button = content.document.getElementById(
        "category-metrics-table"
      );
      is(metrics_table_category_button, null);
    });
  });

  Services.prefs.setBoolPref("about.glean.redesign.enabled", true);
  await BrowserTestUtils.withNewTab("about:glean", async function (browser) {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async function () {
      let metrics_table_category_button = content.document.getElementById(
        "category-metrics-table"
      );
      Assert.notEqual(
        metrics_table_category_button,
        null,
        "Metrics table category button should not be null"
      );
    });
  });
});

add_task(async function test_about_glean_metrics_table_loads_dynamically() {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("about.glean.redesign.enabled");
  });
  Services.prefs.setBoolPref("about.glean.redesign.enabled", true);

  await BrowserTestUtils.withNewTab("about:glean", async function (browser) {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async function () {
      const { TestUtils } = ChromeUtils.importESModule(
        "resource://testing-common/TestUtils.sys.mjs"
      );
      content.document.getElementById("category-metrics-table").click();

      let tableContainer, tableBody;
      const fetchTableBody = () => {
        tableContainer = content.document.getElementById(
          "metrics-table-instance"
        );
        tableBody = content.document.getElementById("metrics-table-body");
        info(tableBody);
      };
      fetchTableBody();

      let currentChildrenLength = tableBody.children.length;
      const tableChildrenLengthChanged = () => {
        fetchTableBody();
        if (currentChildrenLength != tableBody.children.length) {
          currentChildrenLength = tableBody.children.length;
          return true;
        }
        return false;
      };
      let currentFirstChild =
        tableBody.children[0].attributes["data-d3-row"].value;
      const tableFirstChildChanged = () => {
        fetchTableBody();
        if (
          currentFirstChild !=
          tableBody.children[0].attributes["data-d3-row"].value
        ) {
          currentFirstChild =
            tableBody.children[0].attributes["data-d3-row"].value;
          return true;
        }
        return false;
      };

      Assert.equal(
        currentChildrenLength,
        200,
        "Table should start with 200 elements in it"
      );

      // Scroll and extend the count to 300
      tableContainer.scrollTo({
        top: tableContainer.scrollHeight - 1000,
        behavior: "instant",
      });

      await TestUtils.waitForCondition(
        tableChildrenLengthChanged,
        "Wait for table children length to change",
        100,
        3
      );

      Assert.equal(
        tableBody.children.length,
        300,
        "Table should now have 300 elements in it"
      );

      // Scroll and extend the count to 400
      tableContainer.scrollTo({
        top: tableContainer.scrollHeight - 1000,
        behavior: "instant",
      });

      await TestUtils.waitForCondition(
        tableChildrenLengthChanged,
        "Wait for table children length to change",
        100,
        3
      );

      Assert.equal(
        tableBody.children.length,
        400,
        "Table should now have 400 elements in it"
      );

      // Scroll and extend the count to 500
      tableContainer.scrollTo({
        top: tableContainer.scrollHeight - 1000,
        behavior: "instant",
      });

      await TestUtils.waitForCondition(
        tableChildrenLengthChanged,
        "Wait for table children length to change",
        100,
        3
      );

      Assert.equal(
        tableBody.children.length,
        500,
        "Table should now have 500 elements in it"
      );

      // Scroll offset the metrics by 100
      tableContainer.scrollTo({
        top: tableContainer.scrollHeight - 1000,
        behavior: "instant",
      });

      await TestUtils.waitForCondition(
        tableFirstChildChanged,
        "Wait for the table's first child to change",
        100,
        3
      );

      Assert.equal(
        tableBody.children.length,
        500,
        "Table should still have 500 elements in it"
      );
    });
  });
});

add_task(async function t() {
  Services.fog.testResetFOG();
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("about.glean.redesign.enabled");
  });
  Services.prefs.setBoolPref("about.glean.redesign.enabled", true);

  await BrowserTestUtils.withNewTab("about:glean", async function (browser) {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async function () {
      const { TestUtils } = ChromeUtils.importESModule(
        "resource://testing-common/TestUtils.sys.mjs"
      );
      content.document.getElementById("category-metrics-table").click();

      let tableBody;
      const fetchTableBody = () => {
        tableBody = content.document.getElementById("metrics-table-body");
        info(tableBody);
      };
      fetchTableBody();
      let currentFirstChild =
        tableBody.children[0].attributes["data-d3-row"].value;

      const tableFirstChildChanged = () => {
        fetchTableBody();
        if (
          currentFirstChild !=
          tableBody.children[0].attributes["data-d3-row"].value
        ) {
          currentFirstChild =
            tableBody.children[0].attributes["data-d3-row"].value;
          return true;
        }
        return false;
      };

      const input = content.document.getElementById("filter-metrics");
      input.value = "aCustomDist";
      input.dispatchEvent(new Event("input"));

      await TestUtils.waitForCondition(
        tableFirstChildChanged,
        "Wait for the table's first child to change",
        100,
        3
      );

      Glean.testOnlyIpc.aCustomDist.accumulateSamples([0, 0, 1, 1, 1]);

      content.document
        .querySelector(
          "[data-d3-row='testOnlyIpc.aCustomDist'] button[data-l10n-id='about-glean-button-load-value']"
        )
        .click();

      let valueCell;
      const getValueCell = () => {
        valueCell = content.document.querySelector(
          "[data-d3-row='testOnlyIpc.aCustomDist'] [data-d3-cell='value']"
        );
        info(valueCell);
      };
      getValueCell();

      Assert.equal(valueCell.childElementCount, 1);
      Assert.equal(valueCell.firstChild.tagName, "svg");

      //            td        svg        g.boxes    g*n     >rect+text+text
      const boxes = valueCell.firstChild.firstChild.children;

      Assert.equal(boxes.length, 3);
      Assert.equal(boxes[0].children[1].textContent, "2");
      Assert.equal(boxes[0].children[2].textContent, "0");
      Assert.equal(boxes[1].children[1].textContent, "3");
      Assert.equal(boxes[1].children[2].textContent, "1");

      Services.fog.testResetFOG();
      content.document
        .querySelector(
          "[data-d3-row='testOnlyIpc.aCustomDist'] button[data-l10n-id='about-glean-button-load-value']"
        )
        .click();

      getValueCell();

      Assert.equal(valueCell.childElementCount, 1);
      Assert.equal(valueCell.firstChild.tagName, "P");
      Assert.equal(
        valueCell.firstChild.getAttribute("data-l10n-id"),
        "about-glean-no-data-to-display"
      );
    });
  });
});
