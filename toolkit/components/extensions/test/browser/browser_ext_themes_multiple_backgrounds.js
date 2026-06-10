"use strict";

add_task(async function test_support_backgrounds_position() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      theme: {
        images: {
          theme_frame: "face1.png",
          additional_backgrounds: ["face2.png", "face2.png", "face2.png"],
        },
        colors: {
          frame: `rgb(${FRAME_COLOR.join(",")})`,
          tab_background_text: `rgb(${TAB_BACKGROUND_TEXT_COLOR.join(",")})`,
        },
        properties: {
          additional_backgrounds_alignment: [
            "left top",
            "center top",
            "right bottom",
          ],
        },
      },
    },
    files: {
      "face1.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
      "face2.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
    },
  });

  await extension.startup();

  let docEl = document.documentElement;

  Assert.ok(docEl.hasAttribute("lwtheme"), "LWT attribute should be set");
  Assert.ok(
    docEl.hasAttribute("lwtheme-brighttext"),
    "LWT text color attribute should be set"
  );

  let bgImageElement = gNavToolbox;
  let bgImageCS = window.getComputedStyle(bgImageElement);
  let mainBgImage = bgImageCS.backgroundImage.split(",")[0].trim();
  Assert.equal(
    bgImageCS.backgroundImage,
    [1, 2, 2, 2]
      .map(num => mainBgImage.replace(/face[\d]*/, `face${num}`))
      .join(", "),
    "The backgroundImage should use face1.png once and face2.png three times."
  );
  Assert.equal(
    bgImageCS.backgroundPosition,
    "100% 0%, 0% 0%, 50% 0%, 100% 100%",
    "The backgroundPosition should use the three values provided, preceded by the default for theme_frame."
  );
  /**
   * We expect duplicate background-repeat values because we apply `no-repeat`
   * once for theme_frame, and again as the default value of
   * --lwt-background-tiling.
   */
  Assert.equal(
    bgImageCS.backgroundRepeat,
    "no-repeat, no-repeat",
    "The backgroundPosition should use the default value."
  );

  await extension.unload();

  Assert.ok(!docEl.hasAttribute("lwtheme"), "LWT attribute should not be set");
  bgImageCS = window.getComputedStyle(bgImageElement);

  // Styles should've reverted to their initial values.
  Assert.equal(bgImageCS.backgroundImage, "none");
  Assert.equal(bgImageCS.backgroundPosition, "0% 0%");
  Assert.equal(bgImageCS.backgroundRepeat, "repeat");
});

add_task(async function test_support_backgrounds_repeat() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      theme: {
        images: {
          theme_frame: "face0.png",
          additional_backgrounds: ["face1.png", "face2.png", "face3.png"],
        },
        colors: {
          frame: FRAME_COLOR,
          tab_background_text: TAB_BACKGROUND_TEXT_COLOR,
        },
        properties: {
          additional_backgrounds_tiling: ["repeat-x", "repeat-y", "repeat"],
        },
      },
    },
    files: {
      "face0.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
      "face1.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
      "face2.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
      "face3.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
    },
  });

  await extension.startup();

  let docEl = window.document.documentElement;

  let bgImageElement = document.body;
  let bgImageCS = window.getComputedStyle(bgImageElement);

  Assert.ok(docEl.hasAttribute("lwtheme"), "LWT attribute should be set");
  Assert.ok(
    docEl.hasAttribute("lwtheme-brighttext"),
    "LWT text color attribute should be set"
  );

  let mainBgImage = bgImageCS.backgroundImage.split(",")[0].trim();
  Assert.equal(
    [0, 1, 2, 3]
      .map(num => mainBgImage.replace(/face[\d]*/, `face${num}`))
      .join(", "),
    bgImageCS.backgroundImage,
    "The backgroundImage should use face.png four times."
  );
  /**
   * We expect duplicate background-position values because we apply `right top`
   * once for theme_frame, and again as the default value of
   * --lwt-background-alignment.
   */
  Assert.equal(
    bgImageCS.backgroundPosition,
    "100% 0%, 100% 0%",
    "The backgroundPosition should use the default value."
  );
  Assert.equal(
    bgImageCS.backgroundRepeat,
    "no-repeat, repeat-x, repeat-y, repeat",
    "The backgroundRepeat should use the three values provided for --lwt-background-tiling, preceeded by the default for theme_frame."
  );

  await extension.unload();

  Assert.ok(!docEl.hasAttribute("lwtheme"), "LWT attribute should not be set");
});

add_task(async function test_additional_images_check() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      theme: {
        images: {
          theme_frame: "face.png",
        },
        colors: {
          frame: FRAME_COLOR,
          tab_background_text: TAB_BACKGROUND_TEXT_COLOR,
        },
        properties: {
          additional_backgrounds_tiling: ["repeat-x", "repeat-y", "repeat"],
        },
      },
    },
    files: {
      "face.png": imageBufferFromDataURI(ENCODED_IMAGE_DATA),
    },
  });

  await extension.startup();

  let docEl = window.document.documentElement;
  let body = document.body;

  Assert.ok(docEl.hasAttribute("lwtheme"), "LWT attribute should be set");
  Assert.ok(
    docEl.hasAttribute("lwtheme-brighttext"),
    "LWT text color attribute should be set"
  );

  let bgImageCS = window.getComputedStyle(body);
  let mainBgImage = bgImageCS.backgroundImage.split(",")[0].trim();
  Assert.ok(
    mainBgImage.includes("face.png"),
    `The backgroundImage should use face.png. Actual value is: ${mainBgImage}`
  );
  Assert.ok(
    mainBgImage.includes("face.png"),
    `The backgroundImage should use face.png. Actual value is: ${mainBgImage}`
  );
  Assert.equal(
    bgImageCS.backgroundPosition,
    "100% 0%, 100% 0%",
    "The backgroundPosition should use the default value."
  );
  Assert.equal(
    bgImageCS.backgroundRepeat,
    "no-repeat, no-repeat",
    "The backgroundRepeat should use the default value."
  );

  await extension.unload();

  Assert.ok(!docEl.hasAttribute("lwtheme"), "LWT attribute should not be set");
});
