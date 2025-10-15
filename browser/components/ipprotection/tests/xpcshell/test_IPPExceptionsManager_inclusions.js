/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPExceptionsManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPExceptionsManager.sys.mjs"
);

const MODE_PREF = "browser.ipProtection.exceptionsMode";
const INCLUSIONS_PREF = "browser.ipProtection.domainInclusions";

const SELECT_MODE = "select";

/**
 * Tests manager initialization when there are no inclusions.
 */
add_task(async function test_IPPExceptionsManager_init_with_no_inclusions() {
  const stringPref = "";

  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
  Services.prefs.setStringPref(INCLUSIONS_PREF, stringPref);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.inclusions, "inclusions set found");
  Assert.ok(
    !IPPExceptionsManager.inclusions.size,
    "inclusions set should be empty"
  );

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(INCLUSIONS_PREF);

  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager initialization with registered inclusions.
 */
add_task(async function test_IPPExceptionsManager_init_with_inclusions() {
  const site1 = "https://www.example.com";
  const site2 = "https://www.example.org";
  const site3 = "https://www.another.example.ca";
  const stringPref = `${site1},${site2},${site3}`;

  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
  Services.prefs.setStringPref(INCLUSIONS_PREF, stringPref);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.inclusions, "inclusions set found");
  Assert.equal(
    IPPExceptionsManager.inclusions.size,
    3,
    "inclusions set should have 3 domains"
  );

  Assert.ok(
    IPPExceptionsManager.inclusions.has(site1),
    `inclusions set should include ${site1}`
  );
  Assert.ok(
    IPPExceptionsManager.inclusions.has(site2),
    `inclusions set should include ${site2}`
  );
  Assert.ok(
    IPPExceptionsManager.inclusions.has(site3),
    `inclusions set should include ${site3}`
  );

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(INCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests the manager initialization with an invalid pref string for inclusions.
 */
add_task(
  async function test_IPPExceptionsManager_init_with_invalid_inclusions() {
    const invalidStringPref = "noturl";

    Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
    Services.prefs.setStringPref(INCLUSIONS_PREF, invalidStringPref);

    IPPExceptionsManager.init();

    Assert.ok(IPPExceptionsManager.inclusions, "inclusions set found");
    Assert.ok(
      !IPPExceptionsManager.inclusions.size,
      "inclusions set should have 0 valid domains"
    );

    Services.prefs.clearUserPref(MODE_PREF);
    Services.prefs.clearUserPref(INCLUSIONS_PREF);
    IPPExceptionsManager.uninit();
  }
);

/**
 * Tests that we can add valid domains to the inclusions set.
 */
add_task(async function test_IPPExceptionsManager_add_inclusions() {
  const site1 = "https://www.example.com";

  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
  Services.prefs.setStringPref(INCLUSIONS_PREF, site1);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.inclusions, "inclusions set found");

  const validSite = "https://www.another.example.com";
  const dupeSite = site1;
  const invalidSite = "noturl";

  IPPExceptionsManager.addException(validSite);
  IPPExceptionsManager.addException(dupeSite);
  IPPExceptionsManager.addException(invalidSite);
  IPPExceptionsManager.addException(null);
  IPPExceptionsManager.addException(undefined);

  Assert.equal(
    IPPExceptionsManager.inclusions.size,
    2,
    "inclusions set should only have 2 domains"
  );

  Assert.ok(
    IPPExceptionsManager.inclusions.has(site1),
    `inclusions set should include ${site1}`
  );
  Assert.ok(
    IPPExceptionsManager.inclusions.has(validSite),
    `inclusions set should include ${validSite}`
  );

  let newStringPref = Services.prefs.getStringPref(INCLUSIONS_PREF);

  Assert.ok(newStringPref.includes(site1), `String pref includes ${site1}`);
  Assert.ok(
    newStringPref.includes(validSite),
    `String pref includes ${validSite}`
  );

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(INCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});

/**
 * Tests that we can remove domains from the inclusions set.
 */
add_task(async function test_IPPExceptionsManager_remove_inclusions() {
  const site1 = "https://www.example.com";

  Services.prefs.setStringPref(MODE_PREF, SELECT_MODE);
  Services.prefs.setStringPref(INCLUSIONS_PREF, site1);

  IPPExceptionsManager.init();

  Assert.ok(IPPExceptionsManager.inclusions, "inclusions set found");

  const invalidSite = "urlDoesntExist";

  IPPExceptionsManager.removeException(site1);
  IPPExceptionsManager.removeException(invalidSite);

  Assert.ok(
    !IPPExceptionsManager.inclusions.size,
    "inclusions set should be empty"
  );

  let newStringPref = Services.prefs.getStringPref(INCLUSIONS_PREF);

  Assert.ok(!newStringPref, "String pref should be empty");

  Services.prefs.clearUserPref(MODE_PREF);
  Services.prefs.clearUserPref(INCLUSIONS_PREF);
  IPPExceptionsManager.uninit();
});
