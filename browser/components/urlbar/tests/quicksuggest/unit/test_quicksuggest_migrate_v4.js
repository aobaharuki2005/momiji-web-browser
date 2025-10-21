/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests quick suggest prefs migration from version 3 to 4.

"use strict";

// Expected version 3 default-branch prefs (important core prefs only, assuming
// US region and en-US locale).
const DEFAULT_PREFS = {
  "quicksuggest.enabled": true,
  "quicksuggest.dataCollection.enabled": false,
  "quicksuggest.settingsUi": QuickSuggest.SETTINGS_UI.FULL,
  "suggest.quicksuggest.nonsponsored": true,
  "suggest.quicksuggest.sponsored": true,
};

const TEST_OVERRIDES = {
  migrationVersion: 4,
  defaultPrefs: DEFAULT_PREFS,
};

add_setup(async () => {
  await UrlbarTestUtils.initNimbusFeature();
});

// The following tasks test OFFLINE version 3 to version 4 when SUGGEST IS ENABLED.

// Migrating from:
// * User enabled `quicksuggest.dataCollection.enabled`
//
// Suggest enabled when migration occurs:
// * Yes
//
// Expected:
// * quicksuggest.settingsUi not set on the User Branch
add_task(async function test_migrate_with_datacollection_enabled() {
  await doMigrateTest({
    testOverrides: TEST_OVERRIDES,
    initialUserBranch: {
      "quicksuggest.dataCollection.enabled": true,
    },
    expectedPrefs: {
      defaultBranch: DEFAULT_PREFS,
      userBranch: {
        "quicksuggest.dataCollection.enabled": true,
      },
    },
  });
});

// Migrating from:
// * User has not enabled `quicksuggest.dataCollection.enabled`
//
// Suggest enabled when migration occurs:
// * Yes
//
// Expected:
// * quicksuggest.settingsUi not set on the User Branch
add_task(async function test_migrate_with_datacollection_disabled() {
  await doMigrateTest({
    testOverrides: TEST_OVERRIDES,
    expectedPrefs: {
      defaultBranch: DEFAULT_PREFS,
    },
  });
});
