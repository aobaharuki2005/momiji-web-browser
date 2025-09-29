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

  await BrowserTestUtils.withNewTab("about:glean", async function (browser) {
    ok(!browser.isRemoteBrowser, "Browser should not be remote.");
    await ContentTask.spawn(browser, null, async function () {
      content.document.getElementById("enable-new-features").click();

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

add_task(async function test_about_glean_histogram() {
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

add_task(async function test_about_glean_event_timeline() {
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
      input.value = "anEvent";
      input.dispatchEvent(new Event("input"));

      await TestUtils.waitForCondition(
        tableFirstChildChanged,
        "Wait for the table's first child to change",
        100,
        3
      );

      let extra = {
        value: "a value for Telemetry",
        extra1: "can set extras",
        extra2: "passing more data",
      };
      Glean.testOnlyIpc.anEvent.record(extra);
      Glean.testOnlyIpc.anEvent.record();
      Glean.testOnlyIpc.anEvent.record();

      content.document
        .querySelector(
          "[data-d3-row='testOnlyIpc.anEvent'] button[data-l10n-id='about-glean-button-load-value']"
        )
        .click();

      let valueCell;
      const getValueCell = () => {
        valueCell = content.document.querySelector(
          "[data-d3-row='testOnlyIpc.anEvent'] [data-d3-cell='value']"
        );
      };
      getValueCell();

      Assert.equal(valueCell.childElementCount, 2);
      Assert.equal(valueCell.firstChild.tagName, "svg");

      let code = content.document.querySelector(
        `[data-d3-row='testOnlyIpc.anEvent'] pre>code`
      ).textContent;
      const codeChanged = () => {
        const newCode = content.document.querySelector(
          `[data-d3-row='testOnlyIpc.anEvent'] pre>code`
        ).textContent;
        if (newCode != code) {
          code = newCode;
          return true;
        }
        return false;
      };

      content.document
        .querySelector(`[data-d3-row='testOnlyIpc.anEvent'] g.event`)
        .focus();

      await TestUtils.waitForCondition(
        codeChanged,
        "Wait for the table row's code textContent to change",
        100,
        3
      );

      getValueCell();
      Assert.equal(valueCell.childElementCount, 2);
      Assert.equal(valueCell.lastChild.tagName, "PRE");
      console.log(valueCell.lastChild.firstChild.textContent);
      Assert.equal(
        valueCell.lastChild.firstChild.textContent.includes(extra.value),
        true
      );
    });
  });
});
