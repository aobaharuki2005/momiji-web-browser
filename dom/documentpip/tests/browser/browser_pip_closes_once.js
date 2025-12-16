/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * See https://wicg.github.io/document-picture-in-picture/
 * When the PiP document is destroyed, we should run
 * #close-any-associated-document-picture-in-picture-windows.
 * But that usually means the PiP is going away, so if we aren't careful
 * we might dispatch DOMWindowClose twice.
 */
add_task(async function closing_pip_sends_exactly_one_DOMWindowClosed() {
  const [tab, chromePiP] = await newTabWithPiP();

  let closeCount = 0;
  chromePiP.addEventListener("DOMWindowClose", () => closeCount++);

  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.documentPictureInPicture.window.close();
  });
  await BrowserTestUtils.windowClosed(chromePiP);

  is(closeCount, 1, "Received a single DOMWindowClosed");
  BrowserTestUtils.removeTab(tab);
});
