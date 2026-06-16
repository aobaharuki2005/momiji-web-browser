/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Listen to Local Mode preference changes to instruct the RDP server
 * to update mappings of custom https origin to local folders
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
});

import { require } from "resource://devtools/shared/loader/Loader.sys.mjs";

const { debounce } = require("resource://devtools/shared/debounce.js");

// Preference branch where all the mappings are stored, like this:
//   devtools.local-mode.mappings.0.origin = "firefox.localhost"
//   devtools.local-mode.mappings.1.path = "/path/to/firefox.localhost"
//   devtools.local-mode.mappings.1.origin = "firefox1.localhost"
//   devtools.local-mode.mappings.1.disabled = true
//   devtools.local-mode.mappings.2.origin = "anything.tld"
//   devtools.local-mode.mappings.2.path = "/path/to/anything"
const LOCAL_MODE_MAPPINGS_PREF_PREFIX = "devtools.local-mode.mappings.";

// Map of Pref observer functions keyed by toolbox object
const gToolboxObservers = new WeakMap();

export const LocalModeMappings = {
  async setup(toolbox) {
    // As each mapping involves at least two distinct prefs (origin+path)
    // debounce in order to update the mappings only once when we create
    // or destroy a mapping.
    const observer = debounce(updateMappings.bind(null, toolbox, false), 250);
    gToolboxObservers.set(toolbox, observer);
    Services.prefs.addObserver(LOCAL_MODE_MAPPINGS_PREF_PREFIX, observer);
    await updateMappings(toolbox, true);
  },

  destroy(toolbox) {
    const observer = gToolboxObservers.get(toolbox);
    if (!observer) {
      return;
    }
    Services.prefs.removeObserver(LOCAL_MODE_MAPPINGS_PREF_PREFIX, observer);
  },

  getAllMappings,

  LOCAL_MODE_MAPPINGS_PREF_PREFIX,
};

/**
 * Read all local mode mapping preferences and returns a JS dictionary
 * with all of them, which may be invalid/disabled.
 *
 * @return {Array<object>}
 *   List of all mappings, which looks like this:
 *   [
 *      { origin: "firefox.localhost", disabled: false, path: "/path/to/firefox.localhost" }
 *   ]
 */
function getAllMappings() {
  const mappings = [];
  for (const pref of Services.prefs.getChildList(
    LOCAL_MODE_MAPPINGS_PREF_PREFIX
  )) {
    // Only consider the "origin" preferences in this for..loop
    // e.g.   devtools.local-mode.mappings.0.origin = "firefox.localhost"
    // (See LOCAL_MODE_MAPPINGS_PREF_PREFIX definition)
    const suffix = pref.replace(LOCAL_MODE_MAPPINGS_PREF_PREFIX, "");
    if (!/^\d+\.origin$/.test(suffix)) {
      continue;
    }

    // Origin to serve from a local folder
    // Note that the origin may be a unicode string
    const origin = Services.prefs.getStringPref(pref);

    // Preference prefix
    // e.g.   devtools.local-mode.mappings.0.
    const prefPrefix = pref.replace(/origin$/, "");

    // Absolute path to a local folder to serve the specified origin from
    const path = Services.prefs.getStringPref(prefPrefix + "path", "");
    // Optional boolean to manually disable a mapping
    const disabled = Services.prefs.getBoolPref(prefPrefix + "disabled", false);

    mappings.push({
      origin,
      path,
      disabled,
      prefPrefix,
    });
  }
  // Return a sorted list as `getChildList` doesn't return pref sorted by name
  return mappings.sort((a, b) => {
    return a.prefPrefix.localeCompare(b.prefPrefix);
  });
}

/**
 * Update the mappings by reading new values from the preferences
 * either on devtools startup, or when a pref changes.
 *
 * @param {Toolbox} toolbox
 * @param {boolean} startup
 *        True if we are updating mappings on devtools startup.
 */
async function updateMappings(toolbox, startup = false) {
  const { targetCommand } = toolbox.commands;
  const { targetFront } = targetCommand;

  const serverMappings = {};

  let matchesCurrentLocation = false;
  let atLeastOneMapping = false;
  const currentTargetOrigin =
    targetFront.url && URL.canParse(targetFront.url)
      ? new URL(targetFront.url).host
      : null;
  for (const { origin, path, disabled } of getAllMappings()) {
    // Ignore this origin if it is disabled
    if (disabled) {
      continue;
    }

    let fileExists = false;
    try {
      fileExists = path ? new lazy.FileUtils.File(path).exists() : false;
    } catch (e) {
      console.error("Local mode path is invalid", e);
    }
    if (fileExists) {
      serverMappings[origin] = path;
      atLeastOneMapping = true;

      if (currentTargetOrigin == origin) {
        matchesCurrentLocation = true;
      }
    }
  }

  // Stop any further computation on startup if we have no mappings
  if (startup && !atLeastOneMapping) {
    return;
  }

  const networkFront = await targetCommand.watcherFront.getNetworkParentActor();
  await networkFront.setLocalModeMappings(serverMappings);

  // If the currently debugged document matches any of the local mode origins,
  // and is an error page, it probably means that the page was loaded/restored
  // before DevTools was opened and so failed loading.
  //
  // In order to mitigate the fact that Local Mode only starts once DevTools starts
  // automatically reload the page now that the mapping is registered,
  // so that the user doesn't have to do it manually.
  if (matchesCurrentLocation && targetFront.isErrorPage) {
    await toolbox.reload(true);
  }

  toolbox.emit("local-mode-mappings-updated");
}
