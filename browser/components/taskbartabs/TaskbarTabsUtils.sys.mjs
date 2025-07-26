/* vim: se cin sw=2 ts=2 et filetype=javascript :
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

let lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  Favicons: ["@mozilla.org/browser/favicon-service;1", "nsIFaviconService"],
});

ChromeUtils.defineLazyGetter(lazy, "logConsole", () => {
  return console.createInstance({
    prefix: "TaskbarTabs",
    maxLogLevel: "Warn",
  });
});

export const TaskbarTabsUtils = {
  /**
   * Checks if Taskbar Tabs has been enabled.
   *
   * @returns {bool} `true` if the Taskbar Tabs pref is enabled.
   */
  isEnabled() {
    const pref = "browser.taskbarTabs.enabled";
    return Services.prefs.getBoolPref(pref, false);
  },

  /**
   * Returns a folder to store profile-specific Taskbar Tabs files.
   *
   * @returns {nsIFile} Folder to store Taskbar Tabs files.
   */
  getTaskbarTabsFolder() {
    // Construct the path `[Profile]/taskbartabs/`.
    let folder = Services.dirsvc.get("ProfD", Ci.nsIFile);
    folder.append("taskbartabs");
    return folder;
  },

  /**
   * Checks if the window is a Taskbar Tabs window.
   *
   * @param {Window} aWin - The window to inspect.
   * @returns {bool} true if the window is a Taskbar Tabs window.
   */
  isTaskbarTabWindow(aWin) {
    return aWin.document.documentElement.hasAttribute("taskbartab");
  },

  /**
   * Retrieves the Taskbar Tabs ID for the window.
   *
   * @param {DOMWindow} aWin - The window to retrieve the Taskbar Tabs ID.
   * @returns {string} The Taskbar Tabs ID for the window.
   */
  getTaskbarTabIdFromWindow(aWin) {
    return aWin.document.documentElement.getAttribute("taskbartab");
  },

  /**
   * Retrieves a favicon image container for the provided URL.
   *
   * @param {nsIURI} aUri - The URI to retrieve a favicon for.
   * @returns {imgIContainer} A container of the favicon retrieved, or the
   * default favicon.
   */
  async getFavicon(aUri) {
    let favicon = await lazy.Favicons.getFaviconForPage(aUri);

    let imgContainer;
    if (favicon) {
      lazy.logConsole.debug(`Using favicon at URI ${favicon.dataURI.spec}.`);
      try {
        imgContainer = await getImageFromUri(favicon.dataURI);
      } catch (e) {
        lazy.logConsole.error(
          `${e.message}, falling through to default favicon.`
        );
      }
    }

    if (!imgContainer) {
      lazy.logConsole.debug(
        `Unable to retrieve icon for ${aUri.spec}, using default favicon at ${lazy.Favicons.defaultFavicon.spec}.`
      );
      imgContainer = await getImageFromUri(lazy.Favicons.defaultFavicon);
    }

    return imgContainer;
  },
};

/**
 * Retrieves an image given a URI.
 *
 * @param {nsIURI} aUri - The URI to retrieve an image from.
 * @returns {Promise<imgIContainer>} Resolves to an image container.
 */
async function getImageFromUri(aUri) {
  // Creating the Taskbar Tabs icon should not result in a network request.
  const protocolFlags = Services.io.getProtocolFlags(aUri.scheme);
  if (!(protocolFlags & Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE)) {
    throw new Error(
      `Scheme "${aUri.scheme}" is not supported for creating a Taskbar Tab icon, URI should be local`
    );
  }

  const channel = Services.io.newChannelFromURI(
    aUri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_IMAGE
  );

  const imgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);

  let decodePromise = Promise.withResolvers();
  let observer = imgTools.createScriptedObserver({
    sizeAvailable() {
      decodePromise.resolve();
    },
  });

  let imgPromise = Promise.withResolvers();
  imgTools.decodeImageFromChannelAsync(
    aUri,
    channel,
    (img, status) => {
      if (!Components.isSuccessCode(status)) {
        imgPromise.reject(
          new Error(`Error retrieving image from URI ${aUri.spec}`)
        );
      } else {
        imgPromise.resolve(img);
      }
    },
    observer
  );

  let [img] = await Promise.all([imgPromise.promise, decodePromise.promise]);
  return img;
}
