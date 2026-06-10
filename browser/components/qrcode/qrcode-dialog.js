/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadPaths: "resource://gre/modules/DownloadPaths.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "IDNService",
  "@mozilla.org/network/idn-service;1",
  Ci.nsIIDNService
);

const QRCodeDialog = {
  _url: null,
  _qrCodeDataURI: null,

  /** Initializes the dialog from window arguments. */
  init() {
    if (window.arguments && window.arguments[0]) {
      const params = window.arguments[0];
      this._url = params.url;
      this._qrCodeDataURI = params.qrCodeDataURI;
    }

    document.mozSubdialogReady = this.setupDialog();

    document
      .getElementById("copy-button")
      .addEventListener("click", () => this.copyImage());
    document
      .getElementById("save-button")
      .addEventListener("click", () => this.saveImage());
    document
      .getElementById("close-button")
      .addEventListener("click", () => window.close());
  },

  /**
   * Populates the dialog with the QR code image and URL, or shows an error
   * if the QR code data URI is missing.
   */
  async setupDialog() {
    const successContainer = document.getElementById("success-container");

    if (!this._qrCodeDataURI) {
      this.showFeedback("error", "qrcode-panel-error");
      return;
    }

    const imageElement = document.getElementById("qrcode-image");
    imageElement.src = this._qrCodeDataURI;

    successContainer.hidden = false;

    const urlElement = document.getElementById("qrcode-url");
    urlElement.textContent = this._url;
    urlElement.title = this._url;
  },

  /**
   * Shows a feedback message bar in the dialog and resizes the dialog to fit.
   *
   * @param {string} type - The message bar type ("success" or "error").
   * @param {string} l10nId - The Fluent localization ID for the message.
   */
  async showFeedback(type, l10nId) {
    let bar = document.getElementById("feedback-bar");
    if (!bar) {
      bar = document.createElement("moz-message-bar");
      bar.id = "feedback-bar";
      bar.setAttribute("role", "alert");
      bar.setAttribute("data-l10n-attrs", "message");
      bar.setAttribute("dismissable", "");
      bar.addEventListener("message-bar:user-dismissed", () => {
        requestAnimationFrame(() => window.resizeDialog?.());
      });
      let content = document.getElementById("qrcode-dialog-content");
      content.appendChild(bar);
    }
    bar.type = type;
    document.l10n.setAttributes(bar, l10nId);
    await bar.updateComplete;
    window.resizeDialog?.();
  },

  /**
   * Strips the data URI prefix from the stored QR code data URI, base64-decodes
   * the payload, and returns the raw PNG bytes as a Uint8Array.
   *
   * @returns {Uint8Array} The decoded PNG image bytes.
   * @throws {Error} If the data URI is missing or not a base64-encoded PNG.
   */
  decodeDataURI() {
    const dataPrefix = "data:image/png;base64,";
    if (!this._qrCodeDataURI?.startsWith(dataPrefix)) {
      throw new Error("Invalid QR code image data");
    }

    return Uint8Array.fromBase64(this._qrCodeDataURI.slice(dataPrefix.length));
  },

  /** Copies the QR code image to the clipboard as a PNG. */
  async copyImage() {
    try {
      const qrCodeBytes = this.decodeDataURI();
      const item = new ClipboardItem({
        "image/png": new Blob([qrCodeBytes], { type: "image/png" }),
      });
      await navigator.clipboard.write([item]);
      this.showFeedback("success", "qrcode-copy-success");
    } catch (error) {
      console.error("Failed to copy QR code:", error);
      this.showFeedback("error", "qrcode-copy-error");
    }
  },

  /** Opens a file picker and saves the QR code image as a PNG file. */
  async saveImage() {
    const nsIFilePicker = Ci.nsIFilePicker;
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

    let domain = "";
    let uri;
    try {
      uri = Services.io.newURI(this._url);
      domain = lazy.IDNService.domainToDisplay(
        Services.eTLD.getSchemelessSite(uri)
      );
    } catch (e) {
      if (uri) {
        domain = uri.host;
      }
    }

    const filenameMessage = domain
      ? { id: "qrcode-save-filename-with-domain-base", args: { domain } }
      : "qrcode-save-filename-base";
    const [title, pngFilterTitle, defaultFilename] =
      await document.l10n.formatValues([
        "qrcode-save-title",
        "qrcode-save-filter-png",
        filenameMessage,
      ]);
    fp.init(window.browsingContext, title, nsIFilePicker.modeSave);
    fp.appendFilter(pngFilterTitle, "*.png");
    fp.defaultString = lazy.DownloadPaths.sanitize(defaultFilename);
    fp.defaultExtension = "png";

    const result = await new Promise(resolve => fp.open(resolve));

    if (
      result === nsIFilePicker.returnOK ||
      result === nsIFilePicker.returnReplace
    ) {
      try {
        const qrCodeBytes = this.decodeDataURI();
        await IOUtils.write(fp.file.path, qrCodeBytes);
        this.showFeedback("success", "qrcode-save-success");
      } catch (error) {
        console.error("Failed to save QR code:", error);
        this.showFeedback("error", "qrcode-save-error");
      }
    }
  },
};

// Exposed on `window` for browser-chrome tests.
window.QRCodeDialog = QRCodeDialog;

window.addEventListener("DOMContentLoaded", () => {
  QRCodeDialog.init();
});
