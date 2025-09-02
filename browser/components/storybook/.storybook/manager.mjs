/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { addons } from "@storybook/manager-api";
import darkTheme from "./theme-dark.mjs";
import lightTheme from "./theme-light.mjs";

// Change favicon
const link = document.createElement("link");
link.setAttribute("rel", "shortcut icon");
link.setAttribute("href", "chrome://branding/content/document.ico");
document.head.appendChild(link);

// Detect system color scheme preference
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

addons.setConfig({
  theme: prefersDark ? darkTheme : lightTheme,
});
