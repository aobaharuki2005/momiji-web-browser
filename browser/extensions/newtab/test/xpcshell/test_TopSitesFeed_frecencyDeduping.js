/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TopSitesFeed: "resource://newtab/lib/TopSitesFeed.sys.mjs",
});

const PREF_SOV_ENABLED = "sov.enabled";
const SHOW_SPONSORED_PREF = "showSponsoredTopSites";
const ROWS_PREF = "topSitesRows";

function getTopSitesFeedForTest(
  sandbox,
  { frecent = [], linksWithDefaults = [] } = {}
) {
  let feed = new TopSitesFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    state: {
      Prefs: {
        values: {
          [PREF_SOV_ENABLED]: true,
          [SHOW_SPONSORED_PREF]: true,
          [ROWS_PREF]: 1,
        },
      },
      TopSites: {
        sov: { ready: true },
      },
    },
  };

  feed.frecentCache = {
    request() {
      return this.cache;
    },
    cache: frecent,
  };

  feed._linksWithDefaults = linksWithDefaults;

  feed._contile = {
    sov: true,
    sovEnabled: () => true,
  };

  const frecencyBoostedSponsors = new Map([
    [
      "hostname1",
      {
        domain: "https://domain1.com",
        faviconDataURI: "faviconDataURI1",
        hostname: "hostname1",
        redirectURL: "https://redirectURL1.com",
        title: "title1",
      },
    ],
    [
      "hostname2",
      {
        domain: "https://domain2.com",
        faviconDataURI: "faviconDataURI2",
        hostname: "hostname2",
        redirectURL: "https://redirectURL2.com",
        title: "title2",
      },
    ],
  ]);

  sandbox.stub(feed, "_frecencyBoostedSponsors").value(frecencyBoostedSponsors);

  return feed;
}

add_task(async function test_dedupeSponsorsAgainstTopsites() {
  let sandbox = sinon.createSandbox();
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return a single match with the right format"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [{ url: "https://domain1.com", frecency: 1000 }],
      linksWithDefaults: [
        { url: "https://otherdomain.com", hostname: "otherdomain" },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 1);
    Assert.equal(frecencyBoostedSpocs[0].hostname, "hostname1");

    sandbox.restore();
  }
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should dedupe against matching topsite"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [{ url: "https://domain1.com", frecency: 1000 }],
      linksWithDefaults: [
        {
          url: "https://domain1.com",
          hostname: "hostname1",
          label: "Domain 1",
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 0);

    sandbox.restore();
  }
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should dedupe against matching topsite with path"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [{ url: "https://domain1.com", frecency: 1000 }],
      linksWithDefaults: [
        {
          url: "https://domain1.com/page",
          hostname: "hostname1",
          label: "Domain 1",
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 0);

    sandbox.restore();
  }
});

add_task(async function test_mergeSponsoredLinks_deduplication() {
  {
    let sandbox = sinon.createSandbox();
    info("Two sponsored shortcuts with same hostname should dedupe");
    const feed = getTopSitesFeedForTest(sandbox);

    feed.store.state.TopSites.sov = {
      ready: true,
      positions: [
        { position: 1, assignedPartner: "amp" },
        { position: 2, assignedPartner: "moz-sales" },
      ],
    };

    const sponsoredLinks = {
      amp: [
        {
          url: "https://sponsor1.com",
          hostname: "sponsor1",
          label: "Sponsor 1",
        },
      ],
      "moz-sales": [
        {
          url: "https://sponsor1.com",
          hostname: "sponsor1",
          label: "Different Label",
        },
      ],
      "frec-boost": [],
    };

    const result = feed._mergeSponsoredLinks(sponsoredLinks);
    Assert.equal(result.length, 1);
    Assert.equal(result[0].label, "Sponsor 1");

    sandbox.restore();
  }
  {
    let sandbox = sinon.createSandbox();
    info(
      "Two sponsored shortcuts with same label but different hostname should dedupe"
    );
    const feed = getTopSitesFeedForTest(sandbox);

    feed.store.state.TopSites.sov = {
      ready: true,
      positions: [
        { position: 1, assignedPartner: "amp" },
        { position: 2, assignedPartner: "moz-sales" },
      ],
    };

    const sponsoredLinks = {
      amp: [
        {
          url: "https://sponsor1.com",
          hostname: "sponsor1",
          label: "Brand Name",
        },
      ],
      "moz-sales": [
        {
          url: "https://affiliate.com",
          hostname: "affiliate",
          label: "Brand Name",
        },
      ],
      "frec-boost": [],
    };

    const result = feed._mergeSponsoredLinks(sponsoredLinks);
    Assert.equal(result.length, 1);
    Assert.equal(result[0].hostname, "sponsor1");

    sandbox.restore();
  }
});
