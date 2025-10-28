/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { LightweightThemeManager } = ChromeUtils.importESModule(
  "resource://gre/modules/LightweightThemeManager.sys.mjs"
);

add_task(async function test_forced_colors_themes() {
  await SpecialPowers.pushPrefEnv({
    set: [["ui.useAccessibilityTheme", 0]],
  });

  const THEME_ID = "theme@mochi.test";
  let theme = ExtensionTestUtils.loadExtension({
    manifest: {
      browser_specific_settings: { gecko: { id: THEME_ID } },
      name: "test theme",
      theme: {
        colors: {
          frame: "red",
          tab_background_text: "blue",
        },
      },
    },
    useAddonManager: "temporary",
  });
  await theme.startup();

  let docEl = window.document.documentElement;
  Assert.ok(docEl.hasAttribute("lwtheme"), "LWT attribute should be set");

  await SpecialPowers.pushPrefEnv({
    set: [["ui.useAccessibilityTheme", 1]],
  });

  Assert.equal(
    LightweightThemeManager.themeData.theme.id,
    THEME_ID,
    "The theme manager should indicate that the theme is still active"
  );
  Assert.ok(!docEl.hasAttribute("lwtheme"), "LWT attribute should not be set");
  Assert.ok(
    window.matchMedia("(forced-colors)").matches,
    "should be in forced-colors mode"
  );

  await theme.unload();
});
