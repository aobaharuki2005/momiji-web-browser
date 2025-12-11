/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createRawValuesObject } from "./helpers.mjs";

/**
 * @typedef {object} PropertyTypeConfig
 * @property {string[]} allow Allowed keyword values (e.g., "auto", "none", "transparent")
 * @property {string[]} [tokenTypes] Token categories from tokens-table.mjs whose tokens are valid
 * @property {string[]} [allowFunctions] Allowed CSS function names (e.g., "url", "linear-gradient")
 * @property {boolean} [allowUnits] Whether values with CSS units (e.g., "10px", "50%") are allowed
 * @property {Record<string, string>} [customFixes] Map of raw values to their token replacements for autofix
 */

const customColorFixes = {
  "#000": "black",
  "#000000": "black",
  "#fff": "white",
  "#ffffff": "white",
};

/** @type {PropertyTypeConfig} */
const BackgroundColor = {
  allow: [
    "transparent",
    "currentColor",
    "auto",
    "normal",
    "none",
    "white",
    "black",
  ],
  tokenTypes: ["background-color"],
  customFixes: customColorFixes,
};

/** @type {PropertyTypeConfig} */
const BackgroundAttachment = {
  allow: ["scroll", "fixed", "local"],
};

/** @type {PropertyTypeConfig} */
const BackgroundImage = {
  allow: ["none"],
  allowFunctions: [
    "url",
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeating-conic-gradient",
    "image-set",
  ],
};

/** @type {PropertyTypeConfig} */
const BackgroundPosition = {
  allow: ["top", "bottom", "left", "right", "center"],
  tokenTypes: ["size", "space"],
  allowUnits: true,
};

/** @type {PropertyTypeConfig} */
const BackgroundSize = {
  allow: ["auto", "cover", "contain"],
  tokenTypes: ["size", "space", "icon-size"],
  allowUnits: true,
};

/** @type {PropertyTypeConfig} */
const BackgroundRepeat = {
  allow: ["repeat", "repeat-x", "repeat-y", "no-repeat", "space", "round"],
};

/** @type {PropertyTypeConfig} */
const BackgroundClip = {
  allow: ["border-box", "padding-box", "content-box"],
};

/** @type {PropertyTypeConfig} */
const BoxShadow = {
  allow: ["none"],
  tokenTypes: ["box-shadow"],
};

/** @type {PropertyTypeConfig} */
const FontSize = {
  allow: [
    "xx-small",
    "x-small",
    "small",
    "medium",
    "large",
    "x-large",
    "xx-large",
    "xxx-large",
    "smaller",
    "larger",
  ],
  tokenTypes: ["font-size"],
};

/** @type {PropertyTypeConfig} */
const FontWeight = {
  allow: ["normal"],
  tokenTypes: ["font-weight"],
  customFixes: {
    ...createRawValuesObject(["font-weight"]),
    200: "normal",
    300: "normal",
    400: "normal",
    lighter: "normal",
    500: "var(--font-weight-semibold)",
    510: "var(--font-weight-semibold)",
    800: "var(--font-weight-bold)",
    bold: "var(--font-weight-bold)",
    bolder: "var(--font-weight-bold)",
  },
};

/** @type {PropertyTypeConfig} */
const TextColor = {
  allow: ["currentColor", "white", "black"],
  tokenTypes: ["text-color"],
  customFixes: customColorFixes,
};

/**
 * @typedef {object} PropertyConfig
 * @property {PropertyTypeConfig[]} validTypes Valid type configurations for this property
 * @property {boolean} [shorthand] Whether this property accepts multiple space-separated values
 * @property {boolean} [multiple] Whether this property accepts comma-separated value groups
 * @property {boolean} [slash] Whether this property accepts slash-separated values (e.g., position/size)
 */

/** @type {Record<string, PropertyConfig>} */
export const propertyConfig = {
  "background-color": {
    validTypes: [BackgroundColor],
  },
  background: {
    validTypes: [
      BackgroundColor,
      BackgroundImage,
      BackgroundPosition,
      BackgroundSize,
      BackgroundRepeat,
      BackgroundAttachment,
      BackgroundClip,
    ],
    shorthand: true,
    multiple: true,
    slash: true,
  },
  "box-shadow": {
    validTypes: [BoxShadow],
    multiple: true,
  },
  color: {
    validTypes: [TextColor],
  },
  "font-size": {
    validTypes: [FontSize],
  },
  "font-weight": {
    validTypes: [FontWeight],
  },
};
