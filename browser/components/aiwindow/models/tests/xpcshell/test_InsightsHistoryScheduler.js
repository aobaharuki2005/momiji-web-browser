"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { InsightsHistoryScheduler } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsHistoryScheduler.sys.mjs"
);
const { InsightsDriftDetector } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsDriftDetector.sys.mjs"
);
const { InsightsManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsManager.sys.mjs"
);

const { PREF_GENERATE_INSIGHTS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/InsightsConstants.sys.mjs"
);

// insert N visits so the scheduler crosses its page threshold.
async function addTestVisits(count) {
  let seeded = [];
  let base = Date.now();
  for (let i = 0; i < count; i++) {
    seeded.push({
      url: `https://example${i}.com/`,
      title: `Example ${i}`,
      visits: [{ date: new Date(base - i * 1000) }],
    });
  }
  await PlacesUtils.history.insertMany(seeded);
}

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref(PREF_GENERATE_INSIGHTS);
  await PlacesUtils.history.clear();
});

// Drift triggers => insights run
add_task(async function test_scheduler_runs_when_drift_triggers() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, true);

  const generateStub = sinon
    .stub(InsightsManager, "generateInsightsFromBrowsingHistory")
    .resolves();

  const driftStub = sinon
    .stub(InsightsDriftDetector, "computeHistoryDriftAndTrigger")
    .resolves({
      baselineMetrics: [{ sessionId: 1, jsScore: 0.1, avgSurprisal: 1.0 }],
      deltaMetrics: [{ sessionId: 2, jsScore: 0.9, avgSurprisal: 3.0 }],
      trigger: {
        jsThreshold: 0.5,
        surpriseThreshold: 2.0,
        triggered: true,
        triggeredSessionIds: [2],
      },
    });

  try {
    let scheduler = InsightsHistoryScheduler.maybeInit();

    // Force pagesVisited above threshold for the test.
    scheduler.setPagesVisitedForTesting(100);

    // Run the interval logic once.
    await scheduler.runNowForTesting();

    sinon.assert.calledOnce(generateStub);
  } finally {
    generateStub.restore();
    driftStub.restore();
  }
});

// Drift does NOT trigger => insights skipped
add_task(async function test_scheduler_skips_when_drift_not_triggered() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, true);

  const generateStub = sinon
    .stub(InsightsManager, "generateInsightsFromBrowsingHistory")
    .resolves();

  const driftStub = sinon
    .stub(InsightsDriftDetector, "computeHistoryDriftAndTrigger")
    .resolves({
      baselineMetrics: [{ sessionId: 1, jsScore: 0.1, avgSurprisal: 1.0 }],
      deltaMetrics: [{ sessionId: 2, jsScore: 0.2, avgSurprisal: 1.2 }],
      trigger: {
        jsThreshold: 0.5,
        surpriseThreshold: 2.0,
        triggered: false,
        triggeredSessionIds: [],
      },
    });

  try {
    let scheduler = InsightsHistoryScheduler.maybeInit();
    await addTestVisits(60);
    await scheduler.runNowForTesting();
    sinon.assert.notCalled(generateStub);
  } finally {
    generateStub.restore();
    driftStub.restore();
  }
});

// First run (no previous insights) => insights run even with small history.
add_task(async function test_scheduler_runs_on_first_run_with_small_history() {
  Services.prefs.setBoolPref(PREF_GENERATE_INSIGHTS, true);

  const generateStub = sinon
    .stub(InsightsManager, "generateInsightsFromBrowsingHistory")
    .resolves();

  const driftStub = sinon
    .stub(InsightsDriftDetector, "computeHistoryDriftAndTrigger")
    .resolves({
      baselineMetrics: [],
      deltaMetrics: [],
      trigger: {
        jsThreshold: 0,
        surpriseThreshold: 0,
        triggered: false,
        triggeredSessionIds: [],
      },
    });

  const lastTsStub = sinon
    .stub(InsightsManager, "getLastHistoryInsightTimestamp")
    .resolves(0);

  try {
    let scheduler = InsightsHistoryScheduler.maybeInit();
    Assert.ok(scheduler, "Scheduler should be initialized when pref is true");

    // Set a number of pages that is:
    // - below the normal threshold (25), but
    // - high enough for the special first-run threshold (e.g. 15).
    scheduler.setPagesVisitedForTesting(20);

    // Run the interval logic once.
    await scheduler.runNowForTesting();
    sinon.assert.calledOnce(generateStub);
  } finally {
    generateStub.restore();
    driftStub.restore();
    lastTsStub.restore();
  }
});
