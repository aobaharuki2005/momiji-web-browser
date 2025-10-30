/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * QRCode Worker Implementation
 *
 * This worker handles QR code generation off the main thread.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(
  lazy,
  {
    PromiseWorker: "resource://gre/modules/workers/PromiseWorker.mjs",
  },
  { global: "current" }
);

// Import require for loading CommonJS modules in the worker
importScripts("resource://gre/modules/workers/require.js");

// Now load the QRCode library with the full resource URI
// eslint-disable-next-line no-undef
const QRCode = require("resource://devtools/shared/qrcode/index.js");

/**
 * The QR Code generator that runs in a worker thread
 */
class QRCodeWorkerImpl {
  constructor() {
    this.#connectToPromiseWorker();
  }

  /**
   * Simple ping test for worker communication
   *
   * @returns {string} Returns "pong"
   */
  ping() {
    return "pong";
  }

  /**
   * Check if the QRCode library is available
   *
   * @returns {boolean} True if library is loaded
   */
  hasQRCodeLibrary() {
    return typeof QRCode !== "undefined" && QRCode !== null;
  }

  /**
   * Generate a QR code for the given URL
   *
   * @param {string} url - The URL to encode
   * @param {string} errorCorrectionLevel - Error correction level (L, M, Q, H)
   * @returns {object} Object with width, height, and src data URI
   */
  generateQRCode(url, errorCorrectionLevel = "H") {
    if (!QRCode || !QRCode.encodeToDataURI) {
      throw new Error("QRCode library not available in worker");
    }

    // Generate the QR code data URI
    const qrData = QRCode.encodeToDataURI(url, errorCorrectionLevel);

    return {
      width: qrData.width,
      height: qrData.height,
      src: qrData.src,
    };
  }

  /**
   * Glue code to connect the `QRCodeWorkerImpl` to the PromiseWorker interface.
   */
  #connectToPromiseWorker() {
    const worker = new lazy.PromiseWorker.AbstractWorker();

    worker.dispatch = (method, args = []) => {
      if (!this[method]) {
        throw new Error("Method does not exist: " + method);
      }
      return this[method](...args);
    };

    worker.close = () => self.close();

    worker.postMessage = (message, ...transfers) => {
      self.postMessage(message, ...transfers);
    };

    self.addEventListener("message", msg => worker.handleMessage(msg));
    self.addEventListener("unhandledrejection", function (error) {
      throw error.reason;
    });
  }
}

// Create the worker instance
new QRCodeWorkerImpl();
