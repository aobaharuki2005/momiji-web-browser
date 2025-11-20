/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that ipprotection-flag has the correct content.
 */
add_task(async function test_flags_content() {
  const mockLocation = {
    name: "United States",
    code: "us",
  };

  let content = await openPanel({ isSignedOut: false });

  let cardLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.statusCardEl
  );

  await setPanelState({
    isSignedOut: false,
    location: mockLocation,
  });
  await cardLoadedPromise;

  let statusCard = content.statusCardEl;

  Assert.ok(statusCard.locationEl, "Location details should be present");

  let flag =
    statusCard.locationEl?.shadowRoot.querySelector("ipprotection-flag");

  Assert.ok(flag, "Flag component should be present");

  let icon = flag.shadowRoot.getElementById("location-icon");
  let name = flag.shadowRoot.getElementById("location-name");

  Assert.ok(icon, "Location flag icon should be present");
  Assert.equal(
    name.textContent,
    mockLocation.name,
    "Location name should be correct"
  );

  await closePanel();
});
