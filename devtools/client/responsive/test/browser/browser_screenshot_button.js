/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test global screenshot button and screenshot size with and without a viewport meta tag.
// See Bug 1979518.

const TEST_URL = "data:text/html;charset=utf-8,";
const TEST_URL2 =
  TEST_URL + "<meta name='viewport' content='width=device-width' />";

for (const URL of [TEST_URL, TEST_URL2]) {
  addRDMTask(URL, async function ({ ui }) {
    info(
      `Test global screenshot button and screenshot size ${URL.includes("viewport") ? "with" : "without"} a viewport meta tag`
    );

    const { toolWindow } = ui;
    const { document } = toolWindow;

    info("Click the screenshot button");
    const screenshotButton = document.getElementById("screenshot-button");
    screenshotButton.click();

    const whenScreenshotSucceeded = waitUntilDownload();

    const filePath = await whenScreenshotSucceeded;
    const image = new Image();
    image.src = PathUtils.toFileURI(filePath);

    await once(image, "load");

    const { width, height, ratio } = await spawnViewportTask(ui, {}, () => {
      return {
        width: content.innerWidth,
        height: content.innerHeight,
        ratio: content.devicePixelRatio,
      };
    });

    is(image.width, width * ratio, "screenshot has the expected width");

    is(image.height, height * ratio, "screenshot has the expected height");

    await IOUtils.remove(filePath);
    await resetDownloads();
  });
}
