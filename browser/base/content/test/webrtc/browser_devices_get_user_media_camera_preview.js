/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content/",
  "https://example.com/"
);
const TEST_PAGE = TEST_ROOT + "get_user_media.html";

async function runPreviewTest(cameraOnly) {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_PERMISSION_FAKE, true],
      [PREF_AUDIO_LOOPBACK, ""],
      [PREF_VIDEO_LOOPBACK, ""],
      [PREF_FAKE_STREAMS, true],
      [PREF_FOCUS_SOURCE, false],
    ],
  });

  await BrowserTestUtils.withNewTab(TEST_PAGE, async () => {
    let promise = promisePopupNotificationShown("webRTC-shareDevices");
    let observerPromise = expectObserverCalled("getUserMedia:request");
    await promiseRequestDevice(!cameraOnly, true);
    await promise;
    await observerPromise;

    let webRTCPreviewEl = document.getElementById("webRTC-preview");
    ok(BrowserTestUtils.isVisible(webRTCPreviewEl), "preview is visible");

    let showPreviewButton = webRTCPreviewEl.shadowRoot.querySelector(
      "#show-preview-button"
    );
    ok(
      BrowserTestUtils.isVisible(showPreviewButton),
      "show preview button is visible"
    );

    let stopPreviewButton = webRTCPreviewEl.shadowRoot.querySelector(
      "#stop-preview-button"
    );
    ok(
      !BrowserTestUtils.isVisible(stopPreviewButton),
      "stop preview button is not visible"
    );

    let videoEl = webRTCPreviewEl.shadowRoot.querySelector("video");
    ok(videoEl, "video element is visible");

    info(
      "Check the preview is not playing when the permission prompt is shown"
    );
    ok(videoEl.paused, "video is not playing");
    is(videoEl.srcObject, null, "video srcObject is null");

    info("Start the preview");
    let videoPlayPromise = BrowserTestUtils.waitForEvent(videoEl, "play");
    showPreviewButton.click();
    await videoPlayPromise;

    ok(!videoEl.paused, "video is playing");
    ok(videoEl.srcObject, "video srcObject is not null");

    ok(
      !BrowserTestUtils.isVisible(showPreviewButton),
      "show preview button is not visible"
    );
    ok(
      BrowserTestUtils.isVisible(stopPreviewButton),
      "stop preview button is visible"
    );

    info("Stop the preview");
    let videoEmptiedPromise = BrowserTestUtils.waitForEvent(videoEl, "emptied");
    stopPreviewButton.click();
    await videoEmptiedPromise;

    ok(videoEl.paused, "video is paused");
    is(videoEl.srcObject, null, "video srcObject is null");

    info(
      "Start the preview again then close the permission prompt to ensure the preview is properly cleaned up."
    );
    videoPlayPromise = BrowserTestUtils.waitForEvent(videoEl, "play");
    showPreviewButton.click();
    await videoPlayPromise;

    ok(!videoEl.paused, "video is playing");
    ok(videoEl.srcObject, "video srcObject is not null");

    videoEmptiedPromise = BrowserTestUtils.waitForEvent(videoEl, "emptied");

    info("Close permission prompt");
    observerPromise = expectObserverCalled("getUserMedia:response:deny");
    activateSecondaryAction(kActionDeny);
    await observerPromise;

    await videoEmptiedPromise;
    ok(videoEl.paused, "video is paused");
    is(videoEl.srcObject, null, "video srcObject is null");
  });
}

add_task(async function test_camera_preview_camera_only() {
  await runPreviewTest(true);
});

add_task(async function test_camera_preview_camera_and_microphone() {
  await runPreviewTest(false);
});
