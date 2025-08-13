/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SponsorProtection } = ChromeUtils.importESModule(
  "moz-src:///browser/components/newtab/SponsorProtection.sys.mjs"
);

/**
 * Tests that we do not measure traffic volume for unprotected browsers.
 */
add_task(async function test_no_measure_when_unprotected() {
  Services.fog.testResetFOG();

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    Assert.ok(
      !SponsorProtection.isProtectedBrowser(browser),
      "Browser does not have protection applied."
    );
    Assert.equal(
      Glean.newtab.sponsNavTrafficSent.testGetValue(),
      null,
      "Should not have recorded any sent traffic"
    );
    Assert.equal(
      Glean.newtab.sponsNavTrafficRecvd.testGetValue(),
      null,
      "Should not have recorded any received traffic"
    );
  });
});

/**
 * Tests that we do measure traffic volume for protected browsers. Also tests
 * that measurement stops when the browser has protection removed.
 */
add_task(async function test_measure_when_protected() {
  Services.fog.testResetFOG();

  await BrowserTestUtils.withNewTab("https://example.com", async browser => {
    Assert.ok(
      !SponsorProtection.isProtectedBrowser(browser),
      "Browser does not have protection applied yet."
    );

    SponsorProtection.addProtectedBrowser(browser);

    Assert.ok(
      SponsorProtection.isProtectedBrowser(browser),
      "Browser now has sponsor protection applied.."
    );

    // Now send some network traffic from the content.
    await SpecialPowers.spawn(browser, [], async function () {
      await content.fetch("/", {
        method: "POST",
        body: JSON.stringify({ here: "are some bytes" }),
      });
    });

    const originalSentTraffic =
      Glean.newtab.sponsNavTrafficSent.testGetValue().sum;
    Assert.greater(
      originalSentTraffic,
      0,
      "Should have recorded some sent traffic"
    );
    const originalReceivedTraffic =
      Glean.newtab.sponsNavTrafficRecvd.testGetValue().sum;
    Assert.greater(
      originalReceivedTraffic,
      0,
      "Should have recorded some received traffic"
    );

    // Let's send another request and make sure that the traffic measurements
    // climb a bit.
    await SpecialPowers.spawn(browser, [], async function () {
      await content.fetch("/", {
        method: "POST",
        body: JSON.stringify({ here: "I go sending bytes again" }),
      });
    });

    const secondSentTraffic =
      Glean.newtab.sponsNavTrafficSent.testGetValue().sum;
    Assert.greater(
      secondSentTraffic,
      originalSentTraffic,
      "Should have recorded some more sent traffic"
    );
    const secondReceivedTraffic =
      Glean.newtab.sponsNavTrafficRecvd.testGetValue().sum;
    Assert.greater(
      secondReceivedTraffic,
      originalReceivedTraffic,
      "Should have recorded some more received traffic"
    );

    // Now remove the protection and ensure that the traffic values don't
    // change with any new requests.
    SponsorProtection.removeProtectedBrowser(browser);
    Assert.ok(
      !SponsorProtection.isProtectedBrowser(browser),
      "Browser does not have protection applied anymore."
    );

    // Now send some network traffic from the content.
    await SpecialPowers.spawn(browser, [], async function () {
      await content.fetch("/", {
        method: "POST",
        body: JSON.stringify({ here: "are some more bytes!" }),
      });
    });

    Assert.equal(
      Glean.newtab.sponsNavTrafficSent.testGetValue().sum,
      secondSentTraffic,
      "Should not have recorded any additional sent traffic"
    );
    Assert.equal(
      Glean.newtab.sponsNavTrafficRecvd.testGetValue().sum,
      secondReceivedTraffic,
      "Should not have recorded any additional received traffic"
    );
  });
});
