/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Tests the dynamic auto-compact behavior of gUIDensity, which overrides the
// uidensity to "compact" in small windows under nova, based on the
// browser.compactmode.auto.threshold pref (Bug 2044082).

const PREF_UI_DENSITY = "browser.uidensity";
const PREF_NOVA = "browser.nova.enabled";
const PREF_THRESHOLD = "browser.compactmode.auto.threshold";

// Returns a threshold string strictly below the given ratio (so the
// corresponding auto-compact check fires), and one strictly above it (so the
// check does not fire).
function below(ratio) {
  return String(ratio / 2);
}
function above(ratio) {
  return String(ratio * 2);
}

// The auto-compact height check is REFERENCE_HEIGHT / innerHeight > threshold.
// Compute the ratio for the given window so we can pick thresholds that
// deterministically flip the trigger regardless of the window's real size.
function heightRatio(win) {
  return (
    win.gUIDensity.AUTO_COMPACT_REFERENCE_TABSTRIP_HEIGHT / win.innerHeight
  );
}

async function withNewWindow(callback) {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  try {
    await callback(win);
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
}

function isCompact(win) {
  return win.document.documentElement.getAttribute("uidensity") == "compact";
}

// Reads a computed custom property off the window's root element.
function cssVar(win, name) {
  return win
    .getComputedStyle(win.document.documentElement)
    .getPropertyValue(name)
    .trim();
}

add_task(async function test_auto_compact_engages_in_small_window() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NOVA, true]],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    let ratio = heightRatio(win);
    Services.prefs.setCharPref(PREF_THRESHOLD, below(ratio));
    win.gUIDensity.update();

    let density = win.gUIDensity.getCurrentDensity();
    is(
      density.mode,
      win.gUIDensity.MODE_COMPACT,
      "Auto-compact engages when the tabstrip ratio exceeds the threshold"
    );
    Assert.ok(
      density.overridden,
      "The compact density is reported as overridden"
    );
    Assert.ok(isCompact(win), "The document is marked compact");
  });

  Services.prefs.clearUserPref(PREF_THRESHOLD);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_auto_compact_disabled_above_threshold() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NOVA, true]],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    let ratio = heightRatio(win);
    Services.prefs.setCharPref(PREF_THRESHOLD, above(ratio));
    win.gUIDensity.update();

    let density = win.gUIDensity.getCurrentDensity();
    is(
      density.mode,
      win.gUIDensity.MODE_NORMAL,
      "Auto-compact does not engage when the ratio is below the threshold"
    );
    Assert.ok(!density.overridden, "The density is not reported as overridden");
    Assert.ok(!isCompact(win), "The document is not marked compact");
  });

  Services.prefs.clearUserPref(PREF_THRESHOLD);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_user_uidensity_disables_auto_compact() {
  await withNewWindow(async win => {
    let ratio = heightRatio(win);
    await SpecialPowers.pushPrefEnv({
      set: [
        [PREF_NOVA, true],
        // A triggering threshold, but the user has explicitly chosen a
        // (non-default) uidensity, which must win over auto-compact.
        [PREF_THRESHOLD, below(ratio)],
        [PREF_UI_DENSITY, win.gUIDensity.MODE_TOUCH],
      ],
    });

    win.gUIDensity.update();

    let density = win.gUIDensity.getCurrentDensity();
    is(
      density.mode,
      win.gUIDensity.MODE_TOUCH,
      "Auto-compact is skipped when the user has chosen a uidensity value"
    );
    Assert.ok(!density.overridden, "The density is not reported as overridden");
    Assert.ok(!isCompact(win), "The document is not marked compact");

    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_threshold_zero_disables_auto_compact() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA, true],
      [PREF_THRESHOLD, "0"],
    ],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    win.gUIDensity.update();
    is(
      win.gUIDensity.getCurrentDensity().mode,
      win.gUIDensity.MODE_NORMAL,
      "A threshold of zero disables auto-compact entirely"
    );
    Assert.ok(!isCompact(win), "The document is not marked compact");
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_nova_disabled_disables_auto_compact() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NOVA, false]],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    let ratio = heightRatio(win);
    Services.prefs.setCharPref(PREF_THRESHOLD, below(ratio));
    win.gUIDensity.update();

    is(
      win.gUIDensity.getCurrentDensity().mode,
      win.gUIDensity.MODE_NORMAL,
      "Auto-compact does not engage when nova is disabled"
    );
    Assert.ok(!isCompact(win), "The document is not marked compact");
  });

  Services.prefs.clearUserPref(PREF_THRESHOLD);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_threshold_change_reevaluates() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NOVA, true]],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    let ratio = heightRatio(win);

    // Start above the threshold: not compact.
    Services.prefs.setCharPref(PREF_THRESHOLD, above(ratio));
    await BrowserTestUtils.waitForCondition(
      () => !isCompact(win),
      "Window starts non-compact above the threshold"
    );

    // Lowering the threshold under the ratio should engage compact via the
    // pref observer, without an explicit update() call.
    Services.prefs.setCharPref(PREF_THRESHOLD, below(ratio));
    await BrowserTestUtils.waitForCondition(
      () => isCompact(win),
      "Lowering the threshold re-evaluates and engages compact"
    );

    // Raising it back should disengage compact.
    Services.prefs.setCharPref(PREF_THRESHOLD, above(ratio));
    await BrowserTestUtils.waitForCondition(
      () => !isCompact(win),
      "Raising the threshold re-evaluates and disengages compact"
    );
  });

  Services.prefs.clearUserPref(PREF_THRESHOLD);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_resize_event_triggers_update() {
  await withNewWindow(async win => {
    let original = win.gUIDensity.update;
    let called = false;
    win.gUIDensity.update = function (...args) {
      called = true;
      return original.apply(this, args);
    };
    try {
      win.dispatchEvent(new win.Event("resize"));
      Assert.ok(called, "A resize event triggers gUIDensity.update()");
    } finally {
      win.gUIDensity.update = original;
    }
  });
});

add_task(async function test_sidebar_launcher_collapsed_requires_revamp() {
  await withNewWindow(async win => {
    await SpecialPowers.pushPrefEnv({
      set: [["sidebar.revamp", false]],
    });
    Assert.ok(
      !win.gUIDensity._isSidebarLauncherCollapsed(),
      "The collapsed-launcher check is false when sidebar.revamp is disabled"
    );
    await SpecialPowers.popPrefEnv();
  });
});

// In a narrow, tall window the collapsed sidebar.revamp launcher width takes a
// larger share of the window than the tabstrip height, so we can pick a
// threshold that only the launcher-width check crosses. This isolates the
// width branch of _shouldAutoCompact() from the height branch.
add_task(async function test_collapsed_launcher_width_triggers_compact() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_NOVA, true],
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
    ],
    clear: [[PREF_UI_DENSITY]],
  });

  await withNewWindow(async win => {
    await BrowserTestUtils.waitForCondition(
      () => win.SidebarController?.initialized,
      "SidebarController is initialized"
    );

    // Put the launcher in its visible-but-collapsed state explicitly rather
    // than relying on the default, which can be overridden by persisted state.
    win.SidebarController._state.launcherVisible = true;
    win.SidebarController._state.launcherExpanded = false;

    Assert.ok(
      win.gUIDensity._isSidebarLauncherCollapsed(),
      "The launcher is visible and collapsed"
    );

    // Isolate the collapsed-launcher width check from the tabstrip-height
    // check without depending on the window manager honoring a tiny window
    // size (resizeTo below the WM minimum width is unreliable in CI).
    // Temporarily inflate the reference launcher width so its ratio comfortably
    // exceeds the height ratio, then pick a threshold between the two so only
    // the width check can engage.
    let originalRefWidth =
      win.gUIDensity.AUTO_COMPACT_REFERENCE_SIDEBAR_LAUNCHER_WIDTH;
    win.gUIDensity.AUTO_COMPACT_REFERENCE_SIDEBAR_LAUNCHER_WIDTH =
      win.innerWidth;
    try {
      let hRatio =
        win.gUIDensity.AUTO_COMPACT_REFERENCE_TABSTRIP_HEIGHT / win.innerHeight;
      let wRatio =
        win.gUIDensity.AUTO_COMPACT_REFERENCE_SIDEBAR_LAUNCHER_WIDTH /
        win.innerWidth;
      Assert.greater(
        wRatio,
        hRatio,
        "Launcher-width ratio isolates the width check from the height check"
      );

      // A threshold between the two ratios: the height check stays below it, so
      // only the collapsed-launcher width check can engage compact.
      Services.prefs.setCharPref(PREF_THRESHOLD, String((hRatio + wRatio) / 2));
      win.gUIDensity.update();
      Assert.ok(
        isCompact(win),
        "Compact engages via the collapsed-launcher width check"
      );

      // Expanding the launcher removes the collapsed condition, so compact
      // should disengage since the height check stays below the threshold.
      win.SidebarController._state.launcherExpanded = true;
      win.gUIDensity.update();
      Assert.ok(
        !isCompact(win),
        "Compact disengages once the launcher is expanded"
      );

      win.SidebarController._state.launcherExpanded = false;
    } finally {
      win.gUIDensity.AUTO_COMPACT_REFERENCE_SIDEBAR_LAUNCHER_WIDTH =
        originalRefWidth;
      Services.prefs.clearUserPref(PREF_THRESHOLD);
    }
  });

  await SpecialPowers.popPrefEnv();
});

// The auto-compact width check uses a fixed reference launcher width, so the
// launcher must visibly shrink in compact mode for the trigger to stay stable.
// Verify the CSS custom property that drives the launcher button padding.
add_task(async function test_compact_shrinks_launcher_padding() {
  await withNewWindow(async win => {
    let medium = cssVar(win, "--space-medium");
    let xsmall = cssVar(win, "--space-xsmall");
    isnot(medium, xsmall, "Sanity: the space tokens have different values");

    win.gUIDensity.update(win.gUIDensity.MODE_NORMAL);
    is(
      cssVar(win, "--sidebar-launcher-button-padding-inline"),
      medium,
      "Launcher button padding matches --space-medium in normal density"
    );

    win.gUIDensity.update(win.gUIDensity.MODE_COMPACT);
    is(
      cssVar(win, "--sidebar-launcher-button-padding-inline"),
      xsmall,
      "Launcher button padding shrinks to --space-xsmall in compact density"
    );

    win.gUIDensity.update(win.gUIDensity.MODE_NORMAL);
  });
});

// Compact mode also shrinks the inline margin around vertical tabs so they fit
// inside the shrunk launcher.
add_task(async function test_compact_shrinks_vertical_tab_margin() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
    ],
  });

  await withNewWindow(async win => {
    let xsmall = cssVar(win, "--space-xsmall");

    win.gUIDensity.update(win.gUIDensity.MODE_NORMAL);
    let normalMargin = cssVar(win, "--tab-inner-inline-margin");

    win.gUIDensity.update(win.gUIDensity.MODE_COMPACT);
    let compactMargin = cssVar(win, "--tab-inner-inline-margin");

    is(
      compactMargin,
      xsmall,
      "Vertical tab inner inline margin is --space-xsmall in compact density"
    );
    isnot(
      compactMargin,
      normalMargin,
      "Vertical tab inner inline margin changes in compact density"
    );

    win.gUIDensity.update(win.gUIDensity.MODE_NORMAL);
  });

  await SpecialPowers.popPrefEnv();
});

registerCleanupFunction(() => {
  // Enabling sidebar.revamp introduces the sidebar button as a side effect,
  // which persists this pref; clear it so we don't leak a changed pref.
  Services.prefs.clearUserPref(
    "browser.toolbarbuttons.introduced.sidebar-button"
  );
});
