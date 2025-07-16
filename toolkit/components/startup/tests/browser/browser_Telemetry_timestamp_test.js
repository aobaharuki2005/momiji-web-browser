"use strict";

const { TelemetryController } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryController.sys.mjs"
);
const { TelemetrySession } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetrySession.sys.mjs"
);

add_task(async function test() {
  let now = Services.telemetry.msSinceProcessStart();
  let payload = TelemetrySession.getPayload("main");

  // Check the first_paint scalar.
  ok(
    "scalars" in payload.processes.parent,
    "Scalars are present in the payload."
  );
  ok(
    "timestamps.first_paint" in payload.processes.parent.scalars,
    "The first_paint timestamp is present in the payload."
  );
  Assert.greater(
    payload.processes.parent.scalars["timestamps.first_paint"],
    0,
    "first_paint scalar is greater than 0."
  );
  Assert.greater(now, 0, "Browser test runtime is greater than zero.");
  // Check that the first_paint scalar is less than the current time.
  Assert.greater(
    now,
    payload.processes.parent.scalars["timestamps.first_paint"],
    "first_paint is less than total browser test runtime."
  );
});

add_task(async function timeline_order() {
  // These must be in the order they happen, which isn't necessarily
  // the order they're listed in the enum.
  const timelineSteps = [
    "process",
    "start",
    "main",
    "selectProfile",
    "afterProfileLocked",
    "startupCrashDetectionBegin",
    "startupCrashDetectionEnd",
    //"sessionRestoreInit", // sessionRestoreInit and createTopLevelWindow aren't stably ordered
    "createTopLevelWindow",
    //"firstPaint", // firstPaint and firstPaint2 aren't stably ordered
    "firstPaint2",
    "sessionRestored",
    "linkerInitialized",
    "librariesLoaded",
    "firstLoadURI",
  ];

  let prev = 0;
  let prevStep;
  for (let step of timelineSteps) {
    const stepValue = Glean.timestamps.startupTimeline[step].testGetValue();
    if (!stepValue) {
      info(`Step ${step} has no value this run. That's okay.`);
      continue;
    }
    Assert.greaterOrEqual(
      stepValue,
      prev,
      `Step ${step} happens later than the ${prevStep}.`
    );
    prev = stepValue;
    prevStep = step;
  }
});

add_task(async function global_timeline_order() {
  // These must be in the order they happen, which isn't necessarily
  // the order they're listed in the metric.
  // There does not appear to be a stable order between all of the groups
  // of steps, so test each group individually.
  const startupTimelineSteps = [
    "process",
    "start",
    "main",
    "selectProfile",
    "afterProfileLocked",
    "startupCrashDetectionBegin",
    "startupCrashDetectionEnd",
    //"sessionRestoreInit", // sessionRestoreInit and createTopLevelWindow aren't stably ordered
    "createTopLevelWindow",
    //"firstPaint", // firstPaint and firstPaint2 aren't stably ordered
    "firstPaint2",
    "sessionRestored",
    "linkerInitialized",
    "librariesLoaded",
    "firstLoadURI",
  ];
  const browserTimelineSteps = [
    "delayedStartupStarted",
    "delayedStartupFinished",
    "blankWindowShown",
  ];
  const sessionTimelineSteps = [
    "sessionRestoreInitialized",
    "sessionRestoreRestoring",
  ];
  const addonTimelineSteps = [
    "AMI_startup_begin",
    "XPI_startup_begin",
    "XPI_bootstrap_addons_begin",
    "XPI_bootstrap_addons_end",
    "XPI_startup_end",
    "AMI_startup_end",
  ];

  const timelines = [
    startupTimelineSteps,
    browserTimelineSteps,
    sessionTimelineSteps,
    addonTimelineSteps,
  ];

  for (let timelineSteps of timelines) {
    let prev = 0;
    let prevStep;
    for (let step of timelineSteps) {
      const stepValue = Glean.timestamps.startupTimeline[step].testGetValue();
      if (!stepValue) {
        info(`Step ${step} has no value this run. That's okay.`);
        continue;
      }
      Assert.greaterOrEqual(
        stepValue,
        prev,
        `Step ${step} happens later than the ${prevStep}.`
      );
      prev = stepValue;
      prevStep = step;
    }
  }
});
