/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Check that about:debugging uses the favicon of tab targets as the icon of their debug
 * target item, and doesn't always use the default globe icon.
 */

// PlaceUtils will not store any favicon for data: uris so we need to use a dedicated page
// here.
const TAB_URL =
  "https://example.com/browser/devtools/client/aboutdebugging/" +
  "test/browser/test-tab-favicons.html";

// The favicon in the page is re-encoded, with different results depending on zlib-rs usage.
const EXPECTED_FAVICON = AppConstants.USE_LIBZ_RS
  ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAXElEQVRYR+3SMQoAIAxD0fb+h9ZBEM3SKfwlTkISeEN7Va16Xt/feV9oyDsAHKCdaeDIA2AB+BEGgAO0Mw0ceQAsAD/CAHCAdqaBIw+ABeBHGAAO0M40cOQBoIANOAOf8d5vwtsAAAAASUVORK5CYII="
  : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAV0lEQVRYR+2UMQ4AIAgD4f+P1m6KcVQ7eMZBJCHNUcgWoTtOzoHeJan4dD4RYCewtvl2z3f1yx8CnhOwmxABdgLsAQjYTYgAOwGmAAJ2EyLAToAp+J5ABzgDn/EwCmG5AAAAAElFTkSuQmCC";

add_task(async function () {
  const faviconTab = await addTab(TAB_URL, { background: true });
  const { document, tab, window } = await openAboutDebugging();
  await selectThisFirefoxPage(document, window.AboutDebugging.store);

  await waitUntil(() => {
    const target = findDebugTargetByText("Favicon tab", document);
    if (!target) {
      return false;
    }
    // We may get a default globe.svg icon for a short period of time while
    // the target tab is still loading.
    return target
      .querySelector(".qa-debug-target-item-icon")
      .src.includes("data:");
  });
  const faviconTabTarget = findDebugTargetByText("Favicon tab", document);
  const faviconTabIcon = faviconTabTarget.querySelector(
    ".qa-debug-target-item-icon"
  );

  is(
    faviconTabIcon.src,
    EXPECTED_FAVICON,
    "The debug target item for the tab shows the favicon of the tab"
  );

  await removeTab(tab);
  await removeTab(faviconTab);
});
