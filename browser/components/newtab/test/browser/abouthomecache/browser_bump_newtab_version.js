/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AboutNewTabResourceMapping } = ChromeUtils.importESModule(
  "resource:///modules/AboutNewTabResourceMapping.sys.mjs"
);

/**
 * Test that if the "newtab-version" metadata on the cache entry doesn't match
 * the expectation that we ignore the cache and load the dynamic about:home
 * document.
 */
add_task(async function test_newtab_bump_version() {
  await withFullyLoadedAboutHome(async browser => {
    // First, ensure that a pre-existing cache exists.
    await simulateRestart(browser);

    let cacheEntry = await AboutHomeStartupCache.ensureCacheEntry();
    Assert.equal(
      cacheEntry.getMetaDataElement("newtab-version"),
      AboutNewTabResourceMapping.addonVersion,
      "Cache entry should be versioned on the newtab version"
    );
    cacheEntry.setMetaDataElement("newtab-version", "somethingnew");
    // We don't need to shutdown write or ensure the cache wins the race,
    // since we expect the cache to be blown away because the version number
    // has been bumped.
    await simulateRestart(browser, {
      withAutoShutdownWrite: false,
      ensureCacheWinsRace: false,
    });
    await ensureDynamicAboutHome(
      browser,
      AboutHomeStartupCache.CACHE_RESULT_SCALARS.INVALIDATED
    );
  });
});
