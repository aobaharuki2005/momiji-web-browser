/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// When the settings redesign is complete, we should remove
// this and replace test_ui_loading_state in
// ./browser_siteData.js with this version.

add_task(async function test_ui_loading_state() {
  let updatedPromise = promiseSiteDataManagerSitesUpdated();
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  await updatedPromise;
  let cacheSize = await SiteDataManager.getCacheSize();

  let doc = gBrowser.selectedBrowser.contentDocument;
  let clearBtn = doc.getElementById("clearSiteDataButton");
  let settingsButton = doc.getElementById("siteDataSettings");
  let totalSiteDataSizeLabel = doc.getElementById("siteDataSize");
  is(
    clearBtn.disabled,
    false,
    "Should enable clear button after sites updated"
  );
  is(
    settingsButton.disabled,
    false,
    "Should enable settings button after sites updated"
  );
  await SiteDataManager.getTotalUsage().then(usage => {
    let [value, unit] = DownloadUtils.convertByteUnits(usage + cacheSize);
    Assert.deepEqual(
      doc.l10n.getAttributes(totalSiteDataSizeLabel),
      {
        id: "sitedata-total-size3",
        args: { value, unit },
      },
      "Should show the right total site data size"
    );
  });

  Services.obs.notifyObservers(null, "sitedatamanager:updating-sites");
  // Wait a tick for the UI to update.
  await new Promise(resolve => requestAnimationFrame(resolve));

  is(
    clearBtn.disabled,
    true,
    "Should disable clear button while updating sites"
  );
  is(
    settingsButton.disabled,
    true,
    "Should disable settings button while updating sites"
  );
  Assert.equal(
    doc.l10n.getAttributes(totalSiteDataSizeLabel).id,
    "sitedata-total-size-calculating2",
    "Should show the loading message while updating"
  );

  Services.obs.notifyObservers(null, "sitedatamanager:sites-updated");
  // Wait a tick for the UI to update.
  await new Promise(resolve => setTimeout(resolve, 0));

  is(
    clearBtn.disabled,
    false,
    "Should enable clear button after sites updated"
  );
  is(
    settingsButton.disabled,
    false,
    "Should enable settings button after sites updated"
  );
  cacheSize = await SiteDataManager.getCacheSize();
  await SiteDataManager.getTotalUsage().then(usage => {
    let [value, unit] = DownloadUtils.convertByteUnits(usage + cacheSize);
    Assert.deepEqual(
      doc.l10n.getAttributes(totalSiteDataSizeLabel),
      {
        id: "sitedata-total-size3",
        args: { value, unit },
      },
      "Should show the right total site data size"
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
