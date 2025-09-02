/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const kShellService = Cc["@mozilla.org/toolkit/shell-service;1"].getService(
  Ci.nsIShellService
);
const kImgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);

const kInputRaster = do_get_file("downscaled.bmp");

let gNativeMimeType = null;
if (kShellService.iconExtension === "png") {
  gNativeMimeType = "image/png";
} else if (kShellService.iconExtension === "ico") {
  gNativeMimeType = "image/x-icon";
} else {
  throw new Error(
    `Platform uses unrecognized ${kShellService.iconExtension} for icon files`
  );
}

add_task(async function test_createIcon_raster() {
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("createIconRaster." + kShellService.iconExtension);
  console.error(file.path);

  const imgInput = await decodeImageFile(kInputRaster, "image/bmp");
  await kShellService.createIcon(file, imgInput);
  const imgOutput = await decodeImageFile(file, gNativeMimeType);

  equal(imgInput.width, imgOutput.width, "Raster image widths match");
  equal(imgInput.height, imgOutput.height, "Raster image heights match");

  file.remove(false);
});

async function decodeImageFile(aFile, aMimeType) {
  const data = await IOUtils.read(aFile.path);
  return kImgTools.decodeImageFromArrayBuffer(data.buffer, aMimeType);
}
