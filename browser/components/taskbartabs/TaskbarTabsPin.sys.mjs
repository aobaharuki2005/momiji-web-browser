/* vim: se cin sw=2 ts=2 et filetype=javascript :
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

let lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ShellService: "resource:///modules/ShellService.sys.mjs",
  TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetters(lazy, {
  Favicons: ["@mozilla.org/browser/favicon-service;1", "nsIFaviconService"],
});

ChromeUtils.defineLazyGetter(lazy, "logConsole", () => {
  return console.createInstance({
    prefix: "TaskbarTabs",
    maxLogLevel: "Warn",
  });
});

/**
 * Provides functionality to pin and unping Taskbar Tabs.
 */
export const TaskbarTabsPin = {
  /**
   * Pins the provided Taskbar Tab to the taskbar.
   *
   * @param {TaskbarTab} aTaskbarTab - A Taskbar Tab to pin to the taskbar.
   * @returns {Promise} Resolves once finished.
   */
  async pinTaskbarTab(aTaskbarTab) {
    lazy.logConsole.info("Pinning Taskbar Tab to the taskbar.");

    let iconPath = await createTaskbarIconFromFavicon(aTaskbarTab);

    let shortcut = await createShortcut(aTaskbarTab, iconPath);

    try {
      await lazy.ShellService.pinShortcutToTaskbar(
        aTaskbarTab.id,
        "Programs",
        shortcut
      );
    } catch (e) {
      lazy.logConsole.error(`An error occurred while pinning: ${e.message}`);
    }
  },

  /**
   * Unpins the provided Taskbar Tab from the taskbar.
   *
   * @param {TaskbarTab} aTaskbarTab - The Taskbar Tab to unpin from the taskbar.
   * @returns {Promise} Resolves once finished.
   */
  async unpinTaskbarTab(aTaskbarTab) {
    lazy.logConsole.info("Unpinning Taskbar Tab from the taskbar.");

    let { relativePath } = await generateShortcutInfo(aTaskbarTab);
    lazy.ShellService.unpinShortcutFromTaskbar("Programs", relativePath);

    let iconFile = getIconFile(aTaskbarTab);

    lazy.logConsole.debug(`Deleting ${relativePath}`);
    lazy.logConsole.debug(`Deleting ${iconFile.path}`);

    await Promise.all([
      lazy.ShellService.deleteShortcut("Programs", relativePath),
      IOUtils.remove(iconFile.path),
    ]);
  },
};

/**
 * Fetches the favicon from the provided Taskbar Tab's start url, and saves it
 * to an icon file.
 *
 * @param {TaskbarTab} aTaskbarTab - The Taskbar Tab to generate an icon file for.
 * @returns {Promise<nsIFile>} The created icon file.
 */
async function createTaskbarIconFromFavicon(aTaskbarTab) {
  lazy.logConsole.info("Creating Taskbar Tabs shortcut icon.");

  let url = Services.io.newURI(aTaskbarTab.startUrl);
  let favicon = await lazy.Favicons.getFaviconForPage(url);

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
      `Unable to retrieve icon for ${aTaskbarTab.startUrl}, using default favicon at ${lazy.Favicons.defaultFavicon.spec}.`
    );
    imgContainer = await getImageFromUri(lazy.Favicons.defaultFavicon);
  }

  let iconFile = getIconFile(aTaskbarTab);

  lazy.logConsole.debug(`Using icon path: ${iconFile.path}`);

  await IOUtils.makeDirectory(iconFile.parent.path);

  await lazy.ShellService.createWindowsIcon(iconFile, imgContainer);

  return iconFile;
}

/**
 * Retrieves an image given a URI.
 *
 * @param {nsIURI} aUri - The URI to retrieve an image from.
 * @returns {Promise<imgIContainer>} Resolves to an image container.
 */
async function getImageFromUri(aUri) {
  // Creating the Taskbar Tabs icon should not result in a network request, so
  // limit channels to `chrome` and in-memory `data` URIs.
  if (!(aUri.scheme === "data" || aUri.scheme === "chrome")) {
    throw new Error(
      `Scheme "${aUri.scheme}" is not supported for creating a Taskbar Tab icon`
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

/**
 * Creates a shortcut that opens Firefox with relevant Taskbar Tabs flags.
 *
 * @param {TaskbarTab} aTaskbarTab - The Taskbar Tab to generate a shortcut for.
 * @param {nsIFile} aFileIcon - The icon file to use for the shortcut.
 * @returns {Promise<string>} The path to the created shortcut.
 */
async function createShortcut(aTaskbarTab, aFileIcon) {
  lazy.logConsole.info("Creating Taskbar Tabs shortcut.");

  let { relativePath, description } = await generateShortcutInfo(aTaskbarTab);
  lazy.logConsole.debug(
    `Using shortcut path relative to Programs folder: ${relativePath}`
  );

  let targetfile = Services.dirsvc.get("XREExeF", Ci.nsIFile);
  let profileFolder = Services.dirsvc.get("ProfD", Ci.nsIFile);

  return await lazy.ShellService.createShortcut(
    targetfile,
    [
      "-taskbar-tab",
      aTaskbarTab.id,
      "-new-window",
      aTaskbarTab.startUrl, // In case Taskbar Tabs is disabled, provide fallback url.
      "-profile",
      profileFolder.path,
      "-container",
      aTaskbarTab.userContextId,
    ],
    description,
    aFileIcon,
    0,
    aTaskbarTab.id, // AUMID
    "Programs",
    relativePath
  );
}

/**
 * Gets the path to the shortcut relative to the Start Menu folder,
 * as well as the description that should be attached to the shortcut.
 *
 * @param {TaskbarTab} aTaskbarTab - The Taskbar Tab to get the path of.
 * @returns {Promise<{description: string, relativePath: string}>} The description
 * and relative path of the shortcut.
 */
async function generateShortcutInfo(aTaskbarTab) {
  const l10n = new Localization([
    "branding/brand.ftl",
    "preview/taskbartabs.ftl",
  ]);

  let humanName = generateName(aTaskbarTab);
  let basename = sanitizeFilename(humanName);
  let dirname = await l10n.formatValue("taskbar-tab-shortcut-folder");
  dirname = sanitizeFilename(dirname, { allowDirectoryNames: true });

  const description = await l10n.formatValue(
    "taskbar-tab-shortcut-description",
    { name: humanName }
  );

  return {
    description,
    relativePath: dirname + "\\" + basename + ".lnk",
  };
}

/**
 * Generates a name for the Taskbar Tab appropriate for user facing UI.
 *
 * @param {TaskbarTab} aTaskbarTab - The Taskbar Tab to generate a name for.
 * @returns {string} A name suitable for user facing UI.
 */
function generateName(aTaskbarTab) {
  // https://www.subdomain.example.co.uk/test
  let uri = Services.io.newURI(aTaskbarTab.startUrl);

  // ["www", "subdomain", "example", "co", "uk"]
  let hostParts = uri.host.split(".");

  // ["subdomain", "example", "co", "uk"]
  if (hostParts[0] === "www") {
    hostParts.shift();
  }

  let suffixDomainCount = Services.eTLD
    .getKnownPublicSuffix(uri)
    .split(".").length;

  // ["subdomain", "example"]
  hostParts.splice(-suffixDomainCount);

  let name = hostParts
    // ["example", "subdomain"]
    .reverse()
    // ["Example", "Subdomain"]
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    // "Example Subdomain"
    .join(" ");

  return name;
}

/**
 * Cleans up the filename so it can be saved safely. This means replacing invalid names
 * (e.g. DOS devices) with others, or replacing invalid characters (e.g. asterisks on
 * Windows) with underscores.
 *
 * @param {string} aWantedName - The name to validate and sanitize.
 * @param {object} aOptions - Options to affect the sanitization.
 * @param {boolean} aOptions.allowDirectoryNames - Indicates that the name will be used
 * as a directory. If so, the validation rules may be slightly more lax.
 * @returns {string} The sanitized name.
 */
function sanitizeFilename(aWantedName, { allowDirectoryNames = false } = {}) {
  const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);

  let flags =
    Ci.nsIMIMEService.VALIDATE_SANITIZE_ONLY |
    Ci.nsIMIMEService.VALIDATE_DONT_COLLAPSE_WHITESPACE;

  if (allowDirectoryNames) {
    flags |= Ci.nsIMIMEService.VALIDATE_ALLOW_DIRECTORY_NAMES;
  }

  return mimeService.validateFileNameForSaving(aWantedName, "", flags);
}

/**
 * Generates a file path to use for the Taskbar Tab icon file.
 *
 * @param {TaskbarTab} aTaskbarTab - A Taskbar Tab to generate an icon file path for.
 * @returns {nsIFile} The icon file path for the Taskbar Tab.
 */
function getIconFile(aTaskbarTab) {
  let iconPath = lazy.TaskbarTabsUtils.getTaskbarTabsFolder();
  iconPath.append("icons");
  iconPath.append(aTaskbarTab.id + ".ico");
  return iconPath;
}
