/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const MockFilePicker = SpecialPowers.MockFilePicker;
MockFilePicker.init(window);

registerCleanupFunction(() => {
  MockFilePicker.cleanup();
});

// A minimal valid PNG data URI so the dialog reaches the success state and
// the save button works.
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA" +
  "C0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function getDefaultFilenameForUrl(url) {
  let captured;

  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    let dialogBox = gBrowser.getTabDialogBox(browser);
    let dialogManager = dialogBox.getTabDialogManager();

    dialogBox.open(
      "chrome://browser/content/qrcode/qrcode-dialog.html",
      { features: "resizable=no", allowDuplicateDialogs: false },
      { url, qrCodeDataURI: TINY_PNG_DATA_URI }
    );

    await BrowserTestUtils.waitForCondition(
      () => dialogManager._dialogs.length,
      "Waiting for QR code subdialog"
    );

    let dialog = dialogManager._dialogs[0];
    await dialog._dialogReady;

    function captureDefaultFilename(filePicker) {
      captured = filePicker.defaultString;
      MockFilePicker.showCallback = null;
      return Ci.nsIFilePicker.returnCancel;
    }

    MockFilePicker.showCallback = captureDefaultFilename;

    await dialog._frame.contentWindow.QRCodeDialog.saveImage();
    dialog._frame.contentWindow.close();
  });

  return captured;
}

add_task(async function test_filename_uses_etld_plus_one() {
  const cases = [
    ["https://www.google.com/maps", "qrcode-google.com"],
    ["https://sub.example.co.uk/path?q=1", "qrcode-example.co.uk"],
    ["https://example.org/", "qrcode-example.org"],
  ];

  for (const [url, expected] of cases) {
    const actual = await getDefaultFilenameForUrl(url);
    Assert.equal(actual, expected, `filename for ${url}`);
  }
});

add_task(async function test_filename_uses_host_without_etld_plus_one() {
  // Single-label hosts and raw IPv4 addresses have no eTLD+1, but the host
  // itself is safe to put in a filename.
  const cases = [
    ["https://localhost/", "qrcode-localhost"],
    ["https://intranet/", "qrcode-intranet"],
    ["https://127.0.0.1/", "qrcode-127.0.0.1"],
  ];

  for (const [url, expected] of cases) {
    const actual = await getDefaultFilenameForUrl(url);
    Assert.equal(actual, expected, `filename for ${url}`);
  }
});

add_task(async function test_filename_uses_unicode_for_idn() {
  // IDN domains are returned in their Unicode display form, not Punycode.
  const cases = [
    ["https://bücher.de/", "qrcode-bücher.de"],
    ["https://xn--bcher-kva.example/", "qrcode-bücher.example"],
  ];

  for (const [url, expected] of cases) {
    const actual = await getDefaultFilenameForUrl(url);
    Assert.equal(actual, expected, `filename for ${url}`);
  }
});

add_task(async function test_filename_sanitizes_unsafe_host() {
  // IPv6 hosts contain ":" which isn't safe in a filename, so sanitize
  // replaces the colons.
  const actual = await getDefaultFilenameForUrl("https://[::1]/");
  Assert.equal(actual, "qrcode-__1", "IPv6 host should be sanitized");
});
