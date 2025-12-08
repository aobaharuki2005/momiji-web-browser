/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TopSitesFeed: "resource://newtab/lib/TopSitesFeed.sys.mjs",
});

const PREF_SOV_ENABLED = "sov.enabled";
const SHOW_SPONSORED_PREF = "showSponsoredTopSites";
const ROWS_PREF = "topSitesRows";

function getTopSitesFeedForTest(
  sandbox,
  {
    frecent = [],
    linksWithDefaults = [
      {
        url: "url",
        hostname: "hostname",
        label: "label",
      },
    ],
  } = {}
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
    },
  };
  feed.frecentCache = {
    request() {
      return this.cache;
    },
    cache: frecent,
  };
  feed._linksWithDefaults = linksWithDefaults;
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
    [
      "hostname3",
      {
        domain: "https://domain3.com",
        faviconDataURI: "faviconDataURI3",
        hostname: "hostname3",
        redirectURL: "https://redirectURL3.com",
        title: "title3",
      },
    ],
    [
      "hostname4",
      {
        domain: "https://domain4.com",
        faviconDataURI: "faviconDataURI4",
        hostname: "hostname4",
        redirectURL: "https://redirectURL4.com",
        title: "title4",
      },
    ],
    [
      "hostname1sub",
      {
        domain: "https://sub.domain1.com",
        faviconDataURI: "faviconDataURI1",
        hostname: "hostname1sub",
        redirectURL: "https://redirectURL1.com",
        title: "title1",
      },
    ],
  ]);

  sandbox.stub(feed, "_frecencyBoostedSponsors").value(frecencyBoostedSponsors);

  return feed;
}

add_task(async function test_frecency_sponsored_topsites() {
  let sandbox = sinon.createSandbox();
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return an empty array with no history"
    );
    const feed = getTopSitesFeedForTest(sandbox);

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 0);

    sandbox.restore();
  }
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return a single match with the right format"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [
        {
          url: "https://domain1.com",
          frecency: 1234,
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 1);
    Assert.deepEqual(frecencyBoostedSpocs[0], {
      hostname: "hostname1",
      url: "https://redirectURL1.com",
      label: "title1",
      partner: "frec-boost",
      type: "frecency-boost",
      frecency: 1234,
      show_sponsored_label: true,
      favicon: "faviconDataURI1",
      faviconSize: 96,
    });

    sandbox.restore();
  }
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return multiple matches"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [
        {
          url: "https://domain1.com",
          frecency: 1234,
        },
        {
          url: "https://domain3.com",
          frecency: 1234,
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 2);
    Assert.equal(frecencyBoostedSpocs[0].hostname, "hostname1");
    Assert.equal(frecencyBoostedSpocs[1].hostname, "hostname3");

    sandbox.restore();
  }
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return a single match with partial url"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [
        {
          url: "https://domain1.com/path",
          frecency: 1234,
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 1);
    Assert.equal(frecencyBoostedSpocs[0].hostname, "hostname1");

    sandbox.restore();
  }
  /*{
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return a single match with a subdomain"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [
        {
          url: "https://www.domain1.com",
          frecency: 1234,
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 1);
    Assert.equal(frecencyBoostedSpocs[0].hostname, "hostname1");

    sandbox.restore();
  }*/
  {
    info(
      "TopSitesFeed.fetchFrecencyBoostedSpocs - " +
        "Should return a single match with a subdomain"
    );
    const feed = getTopSitesFeedForTest(sandbox, {
      frecent: [
        {
          url: "https://domain1.com",
          frecency: 1234,
        },
        {
          url: "https://domain2.com",
          frecency: 1234,
        },
        {
          url: "https://domain3.com",
          frecency: 1234,
        },
        {
          url: "https://domain4.com",
          frecency: 1234,
        },
      ],
      linksWithDefaults: [
        {
          url: "",
          hostname: "hostname1",
          label: "",
        },
        {
          url: "",
          hostname: "",
          label: "hostname2",
        },
        {
          url: "https://hostname3.com",
          hostname: "",
          label: "",
        },
      ],
    });

    const frecencyBoostedSpocs = await feed.fetchFrecencyBoostedSpocs();
    Assert.equal(frecencyBoostedSpocs.length, 1);
    Assert.equal(frecencyBoostedSpocs[0].hostname, "hostname4");

    sandbox.restore();
  }
});
