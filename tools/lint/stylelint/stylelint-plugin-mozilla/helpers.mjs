/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-env node */

import valueParser from "postcss-value-parser";
import { tokensTable } from "../../../../toolkit/themes/shared/design-system/tokens-table.mjs";

/**
 * Our namespace used to prefix Mozilla stylelint rules.
 */
const MOZILLA_NAMESPACE = "stylelint-plugin-mozilla";

/**
 * Namespaces Mozilla's stylelint rules.
 *
 * @param {string} ruleName the name of the stylelint rule.
 * @returns {string}
 */
export function namespace(ruleName) {
  return `${MOZILLA_NAMESPACE}/${ruleName}`;
}

/**
 * The base list of allowed CSS values.
 */
export const ALLOW_LIST = [
  "0",
  "auto",
  "inherit",
  "initial",
  "none",
  "normal",
  "revert",
  "revert-layer",
  "unset",
];

/**
 * Extends our base ALLOW_LIST with additional allowed values.
 *
 * @param {string[]} additionalAllows to be appended to our list
 * @returns {string[]}
 */

export const createAllowList = (additionalAllows = []) => {
  return [ALLOW_LIST, ...additionalAllows];
};

/**
 * Return token names for the given categories.
 *
 * @param {string[]} tokenCategoriesArray
 * @returns {string[]}
 */
export const createTokenNamesArray = tokenCategoriesArray =>
  tokenCategoriesArray
    .flatMap(category => tokensTable[category])
    .reduce((acc, token) => {
      if (token.name) {
        return [...acc, `var(${token.name})`];
      }
      return acc;
    }, []);

/**
 * Collects local (in the same file) CSS properties from a
 * PostCSS object and returns those in object syntax.
 *
 * @param {Record<string, string>} root - A PostCSS value parser root
 * @returns {Record<string, string>}
 */
export const getLocalCustomProperties = root => {
  const cssCustomProperties = {};

  root.walkDecls(decl => {
    if (decl.prop && decl.prop.startsWith("--")) {
      cssCustomProperties[decl.prop] = decl.value;
    }
  });

  return cssCustomProperties;
};

/**
 * Various checks for common design token and CSS content.
 *
 * @param {object} node object from PostCSS value-parser
 * @returns {boolean}
 */

export const isWord = node => node.type === "word";
export const isFunction = node => node.type === "function";
export const isVariableFunction = node =>
  isFunction(node) && node.value === "var";

/**
 * Checks if CSS includes a hex value, e.g. `#00000`.
 *
 * @param {string} value some CSS declaration to match
 * @returns {boolean}
 */
export const containsHexColor = value =>
  valueParser(String(value)).nodes.some(
    node => node.type === "word" && node.value.startsWith("#")
  );

/**
 * Checks if CSS is a valid color function
 * e.g., `rgb(10 10 10)`.
 *
 * @param {string} value some CSS declaration to match
 * @returns {boolean}
 */
export const containsColorFunction = value => {
  const COLOR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "oklch", "color-mix"];

  return valueParser(String(value)).nodes.some(
    node =>
      node.type === "function" && COLOR_FUNCTIONS.includes(String(node.value))
  );
};

/**
 * Looks to see if a value is included in our token var() array.
 *
 * @param {string} value some CSS declaration to match
 * @param {string} tokenCSS the token to match against
 * @returns {boolean}
 */
export const isToken = (value, tokenCSS) => tokenCSS.includes(value);

/**
 * Checks if a CSS value is allowed.
 *
 * @param {string} value some CSS declaration to match
 * @param {string[]} allowList
 * @returns {boolean}
 */
export const isAllowed = (value, allowList) => {
  // If the value is in the allowList
  if (allowList.includes(value)) {
    return true;
  }

  // If the value is in the allowList but the string is CSS shorthand, e.g. `border` properties
  return valueParser(value).nodes.some(
    node => isWord(node) && allowList.includes(node.value)
  );
};

/**
 * Checks if CSS value is a valid fallback expression,
 * e.g., `var(--design-token, #000000);`
 *
 * @param {string} value some CSS declaration to match
 * @param {string[]} tokenCSS
 * @returns {boolean}
 */
export const isValidFallback = (value, tokenCSS) => {
  const parsed = valueParser(String(value));

  return parsed.nodes.some(node => {
    // ignore this if we're not looking at a var()
    if (!isVariableFunction(node)) {
      return false;
    }

    // isolate the token from the declaration
    const firstWordIsToken = node.nodes.find(isWord);

    const firstWordIsTokenAsCSS = `var(${firstWordIsToken.value})`;

    // see if that token is in our token list
    return tokenCSS.includes(firstWordIsTokenAsCSS);
  });
};

/**
 * Checks if CSS custom property defined in the same file is a valid design token
 *
 * @param {string} value some CSS declaration to match
 * @param {object} cssCustomProperties
 * @param {string[]} tokenCSS
 * @returns {boolean}
 */
export const isValidLocalProperty = (value, cssCustomProperties, tokenCSS) => {
  const parsed = valueParser(String(value));
  let customProperty = null;

  parsed.walk(node => {
    if (isVariableFunction(node)) {
      const args = node.nodes.filter(isWord);
      if (args.length) {
        customProperty = args[0].value;
      }
    }
  });

  if (customProperty && cssCustomProperties[customProperty]) {
    return isToken(cssCustomProperties[customProperty].trim(), tokenCSS);
  }
  return false;
};

/**
 * Trims a value for easier checking.
 *
 * @param {string} value some CSS declaration to match
 * @returns {string}
 */

export const trimValue = value => String(value).trim();

/**
 * Checks if CSS value uses tokens correctly.
 *
 * @param {string} value some CSS declaration to match
 * @param {string[]} tokenCSS
 * @param {object} cssCustomProperties
 * @param {string[]} allowList
 * @returns {boolean}
 */
export const isValidTokenUsage = (
  value,
  tokenCSS,
  cssCustomProperties,
  allowList = []
) => {
  const trimmedValue = trimValue(value);

  return (
    isToken(trimmedValue, tokenCSS) ||
    isAllowed(trimmedValue, allowList) ||
    isValidLocalProperty(trimmedValue, cssCustomProperties, tokenCSS) ||
    isValidFallback(trimmedValue, tokenCSS) ||
    tokenCSS.some(token => trimmedValue.includes(token))
  );
};

/**
 * Checks if CSS value uses color tokens correctly.
 *
 * @param {string} value some CSS declaration to match
 * @returns {boolean}
 */
export const dontUseRawColors = value => {
  const trimmedValue = trimValue(value);

  return containsHexColor(trimmedValue) || containsColorFunction(trimmedValue);
};
