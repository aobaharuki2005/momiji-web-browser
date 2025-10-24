/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PREF = "browser.newtabpage.shouldInitialize";

add_task(async function test_aboutnewtab_does_not_init_when_pref_false() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });

  // Reset for a clean start just in case.
  AboutNewTab.uninit();

  // Call init(); with pref=false, we should bail out early.
  AboutNewTab.init();

  ok(
    !AboutNewTab.initialized,
    "AboutNewTab should not be initialized when pref is false"
  );

  // Cleanup just in case, also shouldn't throw or hang.
  AboutNewTab.uninit();
  ok(
    !AboutNewTab.initialized,
    "AboutNewTab should still be uninitialized after uninit()"
  );
});

add_task(async function test_aboutnewtab_initializes_by_default() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, true]] });

  // Reset for a clean start just in case.
  AboutNewTab.uninit();

  // Call init(); with pref=true, we should initialize.
  AboutNewTab.init();

  ok(
    AboutNewTab.initialized,
    "AboutNewTab should initialize when pref is true"
  );

  AboutNewTab.uninit();
  ok(
    !AboutNewTab.initialized,
    "AboutNewTab should be uninitialized after uninit()"
  );
});
