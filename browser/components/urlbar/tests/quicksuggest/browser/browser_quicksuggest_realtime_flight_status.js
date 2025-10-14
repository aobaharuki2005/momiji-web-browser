/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_MERINO_SINGLE = [
  {
    provider: "flightaware",
    is_sponsored: false,
    score: 0,
    title: "Flight Suggestion",
    custom_details: {
      flightaware: {
        values: [
          {
            flight_number: "A1",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin",
              code: "O",
            },
            destination: {
              city: "Destination",
              code: "D",
            },
            departure: {
              scheduled_time: "2025-09-17T14:05:00Z",
            },
            arrival: {
              scheduled_time: "2025-09-17T18:30:00Z",
            },
            status: "Scheduled",
            url: "https://example.com/A1",
          },
        ],
      },
    },
  },
];

const TEST_MERINO_MULTI = [
  {
    provider: "flightaware",
    is_sponsored: false,
    score: 0,
    title: "Flight Suggestion",
    custom_details: {
      flightaware: {
        values: [
          {
            flight_number: "A1",
            airline: {
              name: "A Air",
              code: "A",
              icon: "chrome://browser/skin/urlbar/market-up.svg",
            },
            origin: {
              city: "Origin 1",
              code: "O1",
            },
            destination: {
              city: "Destination 1",
              code: "D1",
            },
            departure: {
              scheduled_time: "2025-09-01T14:01:00Z",
            },
            arrival: {
              scheduled_time: "2025-09-01T18:31:00Z",
            },
            status: "Scheduled",
            url: "https://example.com/A1",
          },
          {
            flight_number: "A2",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin 2",
              code: "O2",
            },
            destination: {
              city: "Destination 2",
              code: "D2",
            },
            departure: {
              scheduled_time: "2025-09-02T14:02:00+02:00",
            },
            arrival: {
              scheduled_time: "2025-09-02T18:32:00-02:00",
            },
            status: "En Route",
            progress_percent: 72,
            time_left_minutes: 1,
            url: "https://example.com/A2",
          },
          {
            flight_number: "A3",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin 3",
              code: "O3",
            },
            destination: {
              city: "Destination 3",
              code: "D3",
            },
            departure: {
              scheduled_time: "2025-09-03T14:03:00+0300",
            },
            arrival: {
              scheduled_time: "2025-09-03T18:33:00-0300",
            },
            status: "Arrived",
            time_left_minutes: 0,
            url: "https://example.com/A3",
          },
          {
            flight_number: "A4",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin 4",
              code: "O4",
            },
            destination: {
              city: "Destination 4",
              code: "D4",
            },
            departure: {
              scheduled_time: "2025-09-04T14:04:00+10:30",
            },
            arrival: {
              scheduled_time: "2025-09-04T18:34:00-10:30",
            },
            status: "Cancelled",
            url: "https://example.com/A4",
          },
          // Delayed flight cases
          {
            flight_number: "D1",
            airline: {
              name: "Delay Air",
              code: "D",
              icon: "chrome://browser/skin/urlbar/market-down.svg",
            },
            origin: {
              city: "Origin D1",
              code: "OD1",
            },
            destination: {
              city: "Destination D1",
              code: "DD1",
            },
            departure: {
              scheduled_time: "2025-09-05T14:05:00+1130",
              estimated_time: "2025-09-05T15:05:00-1130",
            },
            arrival: {
              scheduled_time: "2025-09-05T18:35:00Z",
              estimated_time: "2025-09-05T19:35:00Z",
            },
            status: "Delayed",
            delayed: true,
            url: "https://example.com/D1",
          },
          {
            flight_number: "D2",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin D2",
              code: "OD2",
            },
            destination: {
              city: "Destination D2",
              code: "DD2",
            },
            departure: {
              scheduled_time: "2025-09-06T14:06:00Z",
              estimated_time: "2025-09-06T15:06:00Z",
            },
            arrival: {
              scheduled_time: "2025-09-06T18:36:00Z",
              estimated_time: "2025-09-06T19:36:00Z",
            },
            status: "En Route",
            time_left_minutes: 10,
            delayed: true,
            url: "https://example.com/D2",
          },
          {
            flight_number: "D3",
            airline: {
              name: null,
              code: null,
              icon: null,
            },
            origin: {
              city: "Origin D3",
              code: "OD3",
            },
            destination: {
              city: "Destination D3",
              code: "DD3",
            },
            departure: {
              scheduled_time: "2025-09-07T14:07:00Z",
              estimated_time: "2025-09-07T15:07:00Z",
            },
            arrival: {
              scheduled_time: "2025-09-07T18:37:00Z",
              estimated_time: "2025-09-07T19:37:00Z",
            },
            status: "Arrived",
            delayed: true,
            time_left_minutes: 0,
            url: "https://example.com/D3",
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
      ["flightStatus.featureGate", true],
      ["suggest.flightStatus", true],
      ["suggest.quicksuggest.nonsponsored", true],
    ],
  });
});

add_task(async function ui() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_MULTI;

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "only match the Merino suggestion",
  });
  let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);

  const expectedList = [
    {
      flight_number: "A1, A Air",
      image: "chrome://browser/skin/urlbar/market-up.svg",
      departure_time: "2:01 PM",
      departure_date: "Mon, September 1",
      arrival_time: "6:31 PM",
      origin_airport: "Origin 1 (O1)",
      destination_airport: "Destination 1 (D1)",
      status: "On time",
    },
    {
      flight_number: "A2",
      image: "chrome://browser/skin/urlbar/flight-airline.svg",
      departure_time: "2:02 PM",
      departure_date: "Tue, September 2",
      arrival_time: "6:32 PM",
      origin_airport: "Origin 2 (O2)",
      destination_airport: "Destination 2 (D2)",
      status: "In flight",
      time_left_minutes: "1 min left",
    },
    {
      flight_number: "A3",
      image: "chrome://browser/skin/urlbar/flight-airline.svg",
      departure_time: "2:03 PM",
      departure_date: "Wed, September 3",
      arrival_time: "6:33 PM",
      origin_airport: "Origin 3 (O3)",
      destination_airport: "Destination 3 (D3)",
      status: "Arrived",
      time_left_minutes: "0 mins left",
    },
    {
      flight_number: "A4",
      image: "chrome://browser/skin/urlbar/flight-airline.svg",
      departure_time: "2:04 PM",
      departure_date: "Thu, September 4",
      arrival_time: "6:34 PM",
      origin_airport: "Origin 4 (O4)",
      destination_airport: "Destination 4 (D4)",
      status: "Cancelled",
    },
    {
      flight_number: "D1, Delay Air",
      image: "chrome://browser/skin/urlbar/market-down.svg",
      departure_time: "2:05 PM",
      departure_date: "Fri, September 5",
      arrival_time: "6:35 PM",
      origin_airport: "Origin D1 (OD1)",
      destination_airport: "Destination D1 (DD1)",
      status: "Delayed until 3:05 PM",
    },
    {
      flight_number: "D2",
      image: "chrome://browser/skin/urlbar/flight-airline.svg",
      departure_time: "3:06 PM",
      departure_date: "Sat, September 6",
      arrival_time: "7:36 PM",
      origin_airport: "Origin D2 (OD2)",
      destination_airport: "Destination D2 (DD2)",
      status: "In flight",
      time_left_minutes: "10 mins left",
    },
    {
      flight_number: "D3",
      image: "chrome://browser/skin/urlbar/flight-airline.svg",
      departure_time: "3:07 PM",
      departure_date: "Sun, September 7",
      arrival_time: "7:37 PM",
      origin_airport: "Origin D3 (OD3)",
      destination_airport: "Destination D3 (DD3)",
      status: "Arrived",
      time_left_minutes: "0 mins left",
    },
  ];

  let items = element.row.querySelectorAll(".urlbarView-realtime-item");
  Assert.equal(items.length, expectedList.length);

  for (let i = 0; i < items.length; i++) {
    info(`Check the item[${i}]`);
    let item = items[i];
    let expected = expectedList[i];

    await TestUtils.waitForCondition(
      () =>
        item.querySelector(`[name=status_${i}]`).textContent == expected.status,
      "Wait until the status text will be applied by Fluent"
    );
    Assert.equal(
      item.querySelector(".urlbarView-realtime-image").src,
      expected.image
    );
    Assert.equal(
      item.querySelector(`[name=departure_time_${i}]`).textContent,
      expected.departure_time
    );
    Assert.equal(
      item.querySelector(`[name=departure_date_${i}]`).textContent,
      expected.departure_date
    );
    Assert.equal(
      item.querySelector(`[name=arrival_time_${i}]`).textContent,
      expected.arrival_time
    );
    Assert.equal(
      item.querySelector(`[name=origin_airport_${i}]`).textContent,
      expected.origin_airport
    );
    Assert.equal(
      item.querySelector(`[name=destination_airport_${i}]`).textContent,
      expected.destination_airport
    );
    Assert.equal(
      item.querySelector(`[name=flight_number_${i}]`).textContent,
      expected.flight_number
    );

    let timeLeftMinutes = item.querySelector(`[name=time_left_minutes_${i}]`);
    if (typeof expected.time_left_minutes != "undefined") {
      Assert.equal(timeLeftMinutes.textContent, expected.time_left_minutes);
    } else {
      Assert.equal(timeLeftMinutes.textContent, "");
      let previousSeparator = timeLeftMinutes.previousElementSibling;
      Assert.ok(BrowserTestUtils.isHidden(previousSeparator));
    }
  }

  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});

add_task(async function activate_single() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_SINGLE;

  for (let mouse of [true, false]) {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "only match the Merino suggestion",
    });
    let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);
    let { row } = element;

    let target = TEST_MERINO_SINGLE[0].custom_details.flightaware.values[0];
    let expectedURL = target.url;
    let newTabOpened = BrowserTestUtils.waitForNewTab(gBrowser, expectedURL);

    if (mouse) {
      info("Activate by mouse");
      let root = row.querySelector(".urlbarView-realtime-root");
      EventUtils.synthesizeMouseAtCenter(root, {});
    } else {
      info("Activate by key");
      EventUtils.synthesizeKey("KEY_Tab");
      Assert.equal(
        UrlbarTestUtils.getSelectedRow(window),
        row,
        "The row should be selected"
      );
      EventUtils.synthesizeKey("KEY_Enter");
    }

    let newTab = await newTabOpened;
    Assert.ok(true, `Expected URL is loaded [${expectedURL}]`);

    await UrlbarTestUtils.promisePopupClose(window);
    BrowserTestUtils.removeTab(newTab);
    await PlacesUtils.history.clear();
  }
});

add_task(async function activate_multi() {
  MerinoTestUtils.server.response.body.suggestions = TEST_MERINO_MULTI;

  for (let [
    index,
    value,
  ] of TEST_MERINO_MULTI[0].custom_details.flightaware.values.entries()) {
    info(`Activate item[${index}] by mouse`);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "only match the Merino suggestion",
    });
    let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);

    let items = element.row.querySelectorAll(".urlbarView-realtime-item");
    let item = items[index];

    let newTabOpened = BrowserTestUtils.waitForNewTab(gBrowser, value.url);
    await EventUtils.synthesizeMouseAtCenter(item, {}, item.ownerGlobal);

    let newTab = await newTabOpened;
    Assert.ok(true, `Expected URL is loaded [${value.url}]`);
    BrowserTestUtils.removeTab(newTab);
    await PlacesUtils.history.clear();
  }

  for (let [
    index,
    value,
  ] of TEST_MERINO_MULTI[0].custom_details.flightaware.values.entries()) {
    info(`Activate item[${index}] by key`);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: "only match the Merino suggestion",
    });
    let { element } = await UrlbarTestUtils.getDetailsOfResultAt(window, 1);

    for (let i = 0; i < index + 1; i++) {
      EventUtils.synthesizeKey("KEY_Tab");
    }

    let items = element.row.querySelectorAll(".urlbarView-realtime-item");
    let item = items[index];

    let newTabOpened = BrowserTestUtils.waitForNewTab(gBrowser, value.url);
    await EventUtils.synthesizeMouseAtCenter(item, {}, item.ownerGlobal);
    let newTab = await newTabOpened;
    Assert.ok(true, `Expected URL is loaded [${value.url}]`);
    BrowserTestUtils.removeTab(newTab);
    await PlacesUtils.history.clear();
  }

  await UrlbarTestUtils.promisePopupClose(window);
  gURLBar.handleRevert();
});

function toDate(timeString) {
  let time = new Date(timeString);
  time.setMinutes(time.getMinutes() + time.getTimezoneOffset());
  return time;
}
