/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test that the eyedropper follows the mouse in RDM. See Bug 1932143.

const TEST_URL =
  "data:text/html;charset=utf-8,<meta name='viewport' content='width=device-width' /><iframe></iframe>";

addRDMTask(TEST_URL, async function () {
  info(
    "Test that the eyedropper follows the mouse in RDM without touch simulation"
  );

  const { inspector, highlighterTestFront } = await openInspector();
  await openEyeDropper(inspector, highlighterTestFront);

  await checkEyeDropperFollowsMouse(highlighterTestFront);
});

addRDMTask(TEST_URL, async function ({ ui }) {
  info(
    "Test that the eyedropper follows the mouse in RDM with touch simulation"
  );

  reloadOnTouchChange(true);
  await toggleTouchSimulation(ui);

  const { inspector, highlighterTestFront } = await openInspector();
  await openEyeDropper(inspector, highlighterTestFront);

  await checkEyeDropperFollowsMouse(highlighterTestFront);
});

async function checkEyeDropperFollowsMouse(highlighterTestFront) {
  for (const [x, y] of [
    [40, 60],
    [100, 80],
  ]) {
    await moveMouse(x, y);
    await checkEyeDropperPosition(highlighterTestFront, x, y);
  }
}

async function checkEyeDropperPosition(highlighterTestFront, x, y) {
  const style = await highlighterTestFront.getEyeDropperElementAttribute(
    "eye-dropper-root",
    "style"
  );
  is(
    style,
    `top:${y}px;left:${x}px;`,
    `Eyedropper is at the expected position (${x}, ${y})`
  );
}
