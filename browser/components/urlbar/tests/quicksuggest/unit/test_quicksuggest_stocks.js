/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests stocks suggestions.

"use strict";

add_setup(async function init() {
  await QuickSuggestTestUtils.ensureQuickSuggestInit();
});

add_task(async function telemetryType() {
  Assert.equal(
    QuickSuggest.getFeature("StocksSuggestions").getSuggestionTelemetryType({}),
    "stocks",
    "Telemetry type should be 'stocks'"
  );
});
