"use strict";

var gAnimHistogram = Services.telemetry.getHistogramById(
  "FX_TAB_CLOSE_TIME_ANIM_MS"
);
var gNoAnimHistogram = Services.telemetry.getHistogramById(
  "FX_TAB_CLOSE_TIME_NO_ANIM_MS"
);

/**
 * Takes a Telemetry histogram snapshot and returns the sum of all counts.
 *
 * @param snapshot (Object)
 *        The Telemetry histogram snapshot to examine.
 * @return (int)
 *         The sum of all counts in the snapshot.
 */
function snapshotCount(snapshot) {
  // Use Array.prototype.reduce to sum up all of the
  // snapshot.count entries
  return Object.values(snapshot.values).reduce((a, b) => a + b, 0);
}

/**
 * Takes a Telemetry histogram snapshot and makes sure
 * that the sum of all counts equals expectedCount.
 *
 * @param snapshot (Object)
 *        The Telemetry histogram snapshot to examine.
 * @param expectedCount (int)
 *        What we expect the number of incremented counts to be. For example,
 *        If we expect this probe to have only had a single recording, this
 *        would be 1. If we expected it to have not recorded any data at all,
 *        this would be 0.
 */
function assertCount(snapshot, expectedCount) {
  Assert.equal(
    snapshotCount(snapshot),
    expectedCount,
    `Should only be ${expectedCount} collected value.`
  );
}

/**
 * Takes a Telemetry histogram and waits for the sum of all counts becomes
 * equal to expectedCount.
 *
 * @param histogram (Object)
 *        The Telemetry histogram to examine.
 * @param expectedCount (int)
 *        What we expect the number of incremented counts to become.
 * @return (Promise)
 * @resolves When the histogram snapshot count becomes the expected count.
 */
function waitForSnapshotCount(histogram, expectedCount) {
  return BrowserTestUtils.waitForCondition(() => {
    return snapshotCount(histogram.snapshot()) == expectedCount;
  }, `Collected value should become ${expectedCount}.`);
}

/**
 * Test close time probe histogram accumulation.
 *
 * @param animate (Boolean)
 *        Whether or not the tab is expected to animate on close.
 */
async function testCloseTimeProbe(animate) {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);
  await BrowserTestUtils.waitForCondition(() => tab._fullyOpen);

  gAnimHistogram.clear();
  gNoAnimHistogram.clear();

  BrowserTestUtils.removeTab(tab, { animate });

  await waitForSnapshotCount(gAnimHistogram, animate ? 1 : 0);
  assertCount(gNoAnimHistogram.snapshot(), animate ? 0 : 1);

  gAnimHistogram.clear();
  gNoAnimHistogram.clear();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["test.wait300msAfterTabSwitch", true]],
  });

  // Force-enable tab animations
  gReduceMotionOverride = false;

  // These probes are opt-in, meaning we only capture them if extended
  // Telemetry recording is enabled.
  let oldCanRecord = Services.telemetry.canRecordExtended;
  Services.telemetry.canRecordExtended = true;
  registerCleanupFunction(() => {
    Services.telemetry.canRecordExtended = oldCanRecord;
  });
});

/**
 * Tests the FX_TAB_CLOSE_TIME_ANIM_MS probe by closing a tab with the tab
 * close animation.
 */
add_task(async function test_close_time_anim_probe() {
  await testCloseTimeProbe(true);
});

/**
 * Tests the FX_TAB_CLOSE_TIME_NO_ANIM_MS probe by closing a tab without the
 * tab close animation.
 */
add_task(async function test_close_time_no_anim_probe() {
  await testCloseTimeProbe(false);
});
