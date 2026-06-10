/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import { ModelHub } from  "chrome://global/content/ml/ModelHub.sys.mjs"
 */

/**
 * Helpers for managing the install and uninstall of on-device AI models. This
 * could be a .sys.mjs module if that makes more sense, but any feature-specific
 * helpers could be imported here too.
 */

const XPCOMUtils = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
).XPCOMUtils;
const lazy = XPCOMUtils.declareLazy({
  ModelHub: "chrome://global/content/ml/ModelHub.sys.mjs",
  log: () =>
    console.createInstance({
      prefix: "OnDeviceModelManager",
      maxLogLevel: "Info",
    }),
});

/** @typedef {typeof OnDeviceModelFeatures[keyof typeof OnDeviceModelFeatures]} OnDeviceModelFeaturesEnum */

/**
 * Features that support on-device AI models.
 */
const OnDeviceModelFeatures = Object.freeze({
  // NOTE: Feel free to change the values here to whatever makes sense.
  TabGroups: "tabgroups",
  KeyPoints: "keypoints",
  PdfAltText: "pdfalttext",
});

export const OnDeviceModelManager = {
  features: OnDeviceModelFeatures,

  /** @type {ModelHub} */
  _modelHub: null,
  get modelHub() {
    if (!this._modelHub) {
      this._modelHub = new lazy.ModelHub();
    }
    return this._modelHub;
  },

  /**
   * Install the models for a specific feature. This should be used when a user
   * explicitly enables a feature, so it's ready when they go to use it.
   *
   * @param {OnDeviceModelFeaturesEnum} feature The feature key to install.
   */
  async install(feature) {
    switch (feature) {
      case OnDeviceModelFeatures.TabGroups:
        lazy.log.info("install TabGroups");
        return;
      case OnDeviceModelFeatures.KeyPoints:
        lazy.log.info("install KeyPoints");
        return;
      case OnDeviceModelFeatures.PdfAltText:
        lazy.log.info("install PdfAltText");
        return;
      default:
        throw new Error(`Unknown on-device model feature "${feature}"`);
    }
  },

  /**
   * Uninstall the models for a specific feature.
   *
   * @param {OnDeviceModelFeaturesEnum} feature The feature key to uninstall.
   */
  async uninstall(feature) {
    // TODO: Maybe something like this?
    // this.modelHub.deleteFilesByEngine(feature);
    switch (feature) {
      case OnDeviceModelFeatures.TabGroups:
        lazy.log.info("uninstall TabGroups");
        return;
      case OnDeviceModelFeatures.KeyPoints:
        lazy.log.info("uninstall KeyPoints");
        return;
      case OnDeviceModelFeatures.PdfAltText:
        lazy.log.info("uninstall PdfAltText");
        return;
      default:
        throw new Error(`Unknown on-device model feature "${feature}"`);
    }
  },
};
