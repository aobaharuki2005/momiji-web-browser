/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const FIRSTRUN_URL =
  "chrome://browser/content/aiwindow/ui/content/firstrun.html";

async function openFirstrunPage() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    FIRSTRUN_URL
  );
  return tab;
}

add_task(async function test_firstrun_welcome_screen_renders() {
  const tab = await openFirstrunPage();

  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".screen.AW_AI_WINDOW_WELCOME"),
      "Wait for the AI Window welcome screen to be rendered"
    );

    const welcomeScreen = content.document.querySelector(
      ".screen.AW_AI_WINDOW_WELCOME"
    );
    Assert.ok(
      welcomeScreen,
      "The welcome screen with class 'screen AW_AI_WINDOW_WELCOME' should be present"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
