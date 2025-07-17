/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const DESCRIPTION = "made by browser_createWindowsShortcut.js";
const AUMID = "TESTTEST";
const DEST = "browser_createWindowsShortcut_TestFile.lnk";

add_task(async function test_CreateWindowsShortcut() {
  const file = getFileFrom("C:\\dummy.exe");
  const iconPath = getFileFrom("C:\\dummy.ico");

  const sh = Cc["@mozilla.org/toolkit/shell-service;1"].getService();

  let shortcut;

  // Idea is:
  //   1. Create the shortcut in the given location.
  //   2. Check whether it's pinnable or not (for Programs, TaskbarTabs)
  //   3. Remove it. If the shortcut doesn't exist, then this will throw.
  shortcut = Services.dirsvc.get("Progs", Ci.nsIFile);
  shortcut.append(DEST);
  tryRemove(shortcut);
  await sh.createShortcut(
    file,
    [],
    DESCRIPTION,
    iconPath,
    0,
    AUMID,
    "Programs",
    DEST
  );
  ok(sh.hasPinnableShortcut(AUMID, false), "Programs shortcut is pinnable");
  ok(removeFromShortcutLog(DEST, "STARTMENU"), "Programs shortcut was logged");
  ok(tryRemove(shortcut), "Programs shortcut was deleted");

  let subdir = Services.dirsvc.get("Progs", Ci.nsIFile);
  subdir.append("ShortcutTest");
  tryRemove(subdir);

  shortcut = getFileFrom(subdir);
  shortcut.append(DEST);
  await sh.createShortcut(
    file,
    [],
    DESCRIPTION,
    iconPath,
    0,
    AUMID,
    "Programs",
    "ShortcutTest\\" + DEST
  );
  ok(sh.hasPinnableShortcut(AUMID, false), "Subdirectory shortcut is pinnable");
  ok(
    removeFromShortcutLog("ShortcutTest\\" + DEST, "STARTMENU"),
    "Subdirectory shortcut was logged"
  );
  ok(tryRemove(shortcut), "Subdirectory shortcut file was deleted");
  ok(tryRemove(subdir), "Subdirectory shortcut folder was deleted");

  shortcut = Services.dirsvc.get("Desk", Ci.nsIFile);
  shortcut.append(DEST);
  await sh.createShortcut(
    file,
    [],
    DESCRIPTION,
    iconPath,
    0,
    AUMID,
    "Desktop",
    DEST
  );
  ok(removeFromShortcutLog(DEST, "DESKTOP"), "Desktop shortcut was logged");
  ok(tryRemove(shortcut), "Desktop shortcut was deleted");
});

function getFileFrom(aPath) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance();
  file.QueryInterface(Ci.nsIFile);

  if (typeof aPath === "string") {
    file.initWithPath(aPath);
  } else {
    file.initWithFile(aPath);
  }

  return file;
}

function removeFromShortcutLog(aShortcutName, aSection) {
  const parserFactory =
    Cc["@mozilla.org/xpcom/ini-parser-factory;1"].createInstance();
  parserFactory.QueryInterface(Ci.nsIINIParserFactory);

  // Gather this every time in case a new file was made.
  const logFiles = gatherShortcutLogFiles();

  for (const logFile of logFiles) {
    const parser = parserFactory.createINIParser(logFile);
    parser.QueryInterface(Ci.nsIINIParser);
    parser.QueryInterface(Ci.nsIINIParserWriter);

    for (let i = 0; ; i++) {
      try {
        let string = parser.getString(aSection, `Shortcut${i}`);
        if (string == aShortcutName) {
          parser.deleteString(aSection, `Shortcut${i}`);
          parser.writeFile(logFile);
          return true;
        }
      } catch (e) {
        // The key didn't exist, stop here.
        break;
      }
    }
  }

  return false;
}

function gatherShortcutLogFiles() {
  // We don't know the user's SID from JS-land, so just look at all of them.
  const dir = Services.dirsvc.get("UpdRootD", Ci.nsIFile).parent.parent;
  const enumerator = dir.directoryEntries;
  const result = [];

  for (const file of enumerator) {
    if (file.path.match(/[^_]+_S[^_]*_shortcuts.ini/)) {
      result.push(file);
    }
  }

  enumerator.close();
  return result;
}

function tryRemove(file) {
  try {
    file.remove(false);
    return true;
  } catch (e) {
    return false;
  }
}
