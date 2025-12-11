/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * @typedef {object} PropertyTypeConfig
 * @property {string[]} allow Allowed keyword values (e.g., "auto", "none", "transparent")
 * @property {string[]} [tokenTypes] Token categories from tokens-table.mjs whose tokens are valid
 * @property {string[]} [allowFunctions] Allowed CSS function names (e.g., "url", "linear-gradient")
 * @property {boolean} [allowUnits] Whether values with CSS units (e.g., "10px", "50%") are allowed
 * @property {Record<string, string>} [customFixes] Map of raw values to their token replacements for autofix
 */

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

/**
 * @typedef {object} PropertyConfig
 * @property {PropertyTypeConfig[]} validTypes Valid type configurations for this property
 * @property {boolean} [shorthand] Whether this property accepts multiple space-separated values
 * @property {boolean} [multiple] Whether this property accepts comma-separated value groups
 * @property {boolean} [slash] Whether this property accepts slash-separated values (e.g., position/size)
 */

/** @type {Record<string, PropertyConfig>} */
export const propertyConfig = {
  "box-shadow": {
    validTypes: [BoxShadow],
    multiple: true,
  },
  "font-size": {
    validTypes: [FontSize],
  },
};
