/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_MERINO_SINGLE = [
  {
    provider: "polygon",
    is_sponsored: false,
    score: 0,
    custom_details: {
      polygon: {
        values: [
          {
            image_url: "https://example.com/aapl.svg",
            query: "AAPL stock",
            name: "Apple Inc",
            ticker: "AAPL",
            todays_change_perc: "-0.54",
            last_price: "$181.98 USD",
          },
        ],
      },
    },
  },
];

const TEST_MERINO_MULTI = [
  {
    provider: "polygon",
    is_sponsored: false,
    score: 0,
    custom_details: {
      polygon: {
        values: [
          {
            image_url: "https://example.com/voo.svg",
            query: "VOO stock",
            name: "Vanguard S&P 500 ETF",
            ticker: "VOO",
            todays_change_perc: "-0.11",
            last_price: "$559.44 USD",
            index: "S&P 500",
          },
          {
            image_url: "https://example.com/qqq.svg",
            query: "QQQ stock",
            name: "Invesco QQQ Trust",
            ticker: "QQQ",
            todays_change_perc: "+1.53",
            last_price: "$539.78 USD",
            index: "NASDAQ",
          },
          {
            image_url: "https://example.com/dia.svg",
            query: "DIA stock",
            name: "SPDR Dow Jones ETF",
            ticker: "DIA",
            todays_change_perc: "0",
            last_price: "$430.80 USD",
            index: "Dow Jones",
          },
        ],
      },
    },
  },
];

const TEST_MERINO_NO_SPECIFIC_IMAGE = [
  {
    provider: "polygon",
    is_sponsored: false,
    score: 0,
    custom_details: {
      polygon: {
        values: [
          {
            image_url: "",
            query: "VOO stock",
            name: "Vanguard S&P 500 ETF",
            ticker: "VOO",
            todays_change_perc: "-0.11",
            last_price: "$559.44 USD",
            index: "S&P 500",
          },
          {
            query: "QQQ stock",
            name: "Invesco QQQ Trust",
            ticker: "QQQ",
            todays_change_perc: "+1.53",
            last_price: "$539.78 USD",
            index: "NASDAQ",
          },
        ],
      },
    },
  },
];

add_setup(async function () {
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });
  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
  });

  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    merinoSuggestions: TEST_MERINO_SINGLE,
    prefs: [
      ["market.featureGate", true],
      ["suggest.market", true],
      ["suggest.quicksuggest.nonsponsored", true],
    ],
  });
});

add_task(async function ui_single() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_SINGLE;

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "only match the Merino suggestion",
  });
  let { element, result } = await UrlbarTestUtils.getDetailsOfResultAt(
    window,
    1
  );
  Assert.ok(result.isBestMatch);
  Assert.ok(result.hideRowLabel);

  Assert.ok(
    element.row.querySelector(".urlbarView-button-result-menu"),
    "The row should have a result menu button"
  );

  let items = element.row.querySelectorAll(".urlbarView-market-item");
  Assert.equal(items.length, 1);

  let target = TEST_MERINO_SINGLE[0].custom_details.polygon.values[0];
  assertUI(items[0], {
    image: target.image_url,
    name: target.name,
    todaysChangePerc: target.todays_change_perc,
    lastPrice: target.last_price,
  });

  // Arrow down to select the row.
  EventUtils.synthesizeKey("KEY_ArrowDown");
  let { query } = TEST_MERINO_SINGLE[0].custom_details.polygon.values[0];
  Assert.ok(query, "Sanity check: query is defined");
  Assert.equal(gURLBar.value, query, "Input value should be the query");

  Assert.equal(
    UrlbarTestUtils.getSelectedRow(window),
    element.row,
    "The row should be selected"
  );
  Assert.ok(
    element.row.hasAttribute("descendant-selected"),
    "The row should have descendant-selected attribute since the row inner is selected"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      element.row.querySelector(".urlbarView-button-result-menu")
    ),
    "The result menu button should be visible"
  );

  // Arrow down again past the row.
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.notEqual(
    UrlbarTestUtils.getSelectedRow(window),
    element.row,
    "The row should not be selected after pressing Down"
  );
  Assert.ok(
    !element.row.hasAttribute("descendant-selected"),
    "The row should still not have descendant-selected attribute after pressing Down"
  );

  // Should assert the result menu button is not visible here, but that
  // intermittently fails in verify/TV mode. Because the row is intermittently
  // hovered?

  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});

add_task(async function ui_multi() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_MULTI;

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "only match the Merino suggestion",
  });
  let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);

  let items = element.row.querySelectorAll(".urlbarView-market-item");
  Assert.equal(items.length, 3);

  // Check each item in the row, then select it and check the selection.
  for (let i = 0; i < items.length; i++) {
    info(`Check the item[${i}]`);
    let target = TEST_MERINO_MULTI[0].custom_details.polygon.values[i];
    assertUI(items[i], {
      image: target.image_url,
      name: target.name,
      todaysChangePerc: target.todays_change_perc,
      lastPrice: target.last_price,
    });

    EventUtils.synthesizeKey("KEY_Tab");

    let { query } = TEST_MERINO_MULTI[0].custom_details.polygon.values[i];
    Assert.ok(query, "Sanity check: query is defined at index " + i);
    Assert.equal(
      gURLBar.value,
      query,
      "Input value should be the query at index " + i
    );

    Assert.equal(
      UrlbarTestUtils.getSelectedRow(window),
      element.row,
      "The selected row should be the expected row at index " + i
    );
    Assert.ok(
      element.row.hasAttribute("descendant-selected"),
      "Row should have descendant-selected attribute at index " + i
    );
    Assert.ok(
      BrowserTestUtils.isVisible(
        element.row.querySelector(".urlbarView-button-result-menu")
      ),
      "Result menu button should be visible at index " + i
    );
  }

  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});

add_task(async function activate() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_MULTI;

  let values = TEST_MERINO_MULTI[0].custom_details.polygon.values;
  for (let i = 0; i < values.length; i++) {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "only match the Merino suggestion",
    });
    let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);
    let items = element.row.querySelectorAll(".urlbarView-market-item");

    info("Activate the button");
    let target = TEST_MERINO_MULTI[0].custom_details.polygon.values[i];
    let urlParam = new URLSearchParams({ q: target.query });
    let expectedURL = `https://example.com/?${urlParam}`;
    let onLocationChange = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      expectedURL
    );
    await EventUtils.synthesizeMouseAtCenter(
      items[i],
      {},
      items[i].ownerGlobal
    );
    await onLocationChange;
    Assert.ok(true, `Expected URL is loaded [${expectedURL}]`);

    await UrlbarTestUtils.promisePopupClose(window);
    gURLBar.handleRevert();
  }
});

add_task(async function no_image() {
  MerinoTestUtils.server.response.body.suggestions =
    TEST_MERINO_NO_SPECIFIC_IMAGE;

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "only match the Merino suggestion",
  });
  let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);
  let items = element.row.querySelectorAll(".urlbarView-market-item");

  for (let item of items) {
    let image = item.querySelector(".urlbarView-market-image");
    Assert.equal(
      image.getAttribute("src"),
      "chrome://global/skin/icons/search-glass.svg",
      "Image is fallbacked"
    );
  }

  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});

function assertUI(item, expected) {
  let image = item.querySelector(".urlbarView-market-image");
  Assert.equal(image.getAttribute("src"), expected.image, "Image is correct");

  let name = item.querySelector(".urlbarView-market-name");
  Assert.equal(name.textContent, expected.name, "Name is correct");

  let todaysChangePerc = item.querySelector(
    ".urlbarView-market-todays-change-perc"
  );
  Assert.equal(
    todaysChangePerc.textContent,
    `${expected.todaysChangePerc}%`,
    "Todays change percentage is correct"
  );
  let expectedTodaysChangePercNumber = Number(expected.todaysChangePerc);
  if (expectedTodaysChangePercNumber < 0) {
    Assert.ok(
      todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-minus"
      ),
      "Class that indicates minus is contained"
    );
    Assert.ok(
      !todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-plus"
      ),
      "Class that indicates plus is not contained"
    );
  } else if (expectedTodaysChangePercNumber > 0) {
    Assert.ok(
      !todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-minus"
      ),
      "Class that indicates minus is not contained"
    );
    Assert.ok(
      todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-plus"
      ),
      "Class that indicates plus is contained"
    );
  } else {
    Assert.ok(
      !todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-minus"
      ),
      "Class that indicates minus is not contained"
    );
    Assert.ok(
      !todaysChangePerc.classList.contains(
        "urlbarView-market-todays-change-perc-plus"
      ),
      "Class that indicates plus is not contained"
    );
  }

  let lastPrice = item.querySelector(".urlbarView-market-last-price");
  Assert.equal(
    lastPrice.textContent,
    expected.lastPrice,
    "Last price is correct"
  );
}
