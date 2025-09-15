/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test that the eyedropper's underlying screenshot covers the entire viewport
// in RDM when showing a page without a viewport meta tag. See Bug 1972770.

const TEST_URL =
  "data:text/html;charset=utf-8," +
  `
  <body>
    <div style="position: absolute; left: 800px; width: 200px; height: 100px; background-color: green;"></div>
  </body>
  `;

add_task(async function () {
  info("Test that the eyedropper works in RDM without a viewport meta tag.");

  const { inspector, highlighterTestFront } =
    await openInspectorForURL(TEST_URL);

  info("Switch to RDM");
  await openRDM(gBrowser.selectedTab);
  await openEyeDropper(inspector, highlighterTestFront);

  await moveMouse(50, 50);
  await waitForEyedropperColor(highlighterTestFront, "#ffffff");

  await moveMouse(900, 50);
  await waitForEyedropperColor(highlighterTestFront, "#008000");
});
