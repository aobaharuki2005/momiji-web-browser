"use strict";

/* import-globals-from trr_common.js */
/* import-globals-from head_trr.js */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

function setLocalModeAndURI(mode, url) {
  Services.prefs.setCharPref("network.trr.uri", url);
  Services.prefs.setIntPref("network.trr.mode", mode);
}

let trrServer;
add_setup(async function setup() {
  trr_test_setup();
  Services.prefs.setBoolPref("network.dns.native-is-localhost", true);
  Services.dns.clearCache(true);
  Services.prefs.setIntPref("network.trr.request_timeout_ms", 500);
  Services.prefs.setIntPref(
    "network.trr.strict_fallback_request_timeout_ms",
    500
  );
  Services.prefs.setIntPref("network.trr.request_timeout_mode_trronly_ms", 500);

  trrServer = new TRRServer();
  registerCleanupFunction(async () => {
    await trrServer.stop();
  });
  await trrServer.start();
  dump(`port = ${trrServer.port()}\n`);
  await trrServer.registerDoHAnswers("confirm.example.com", "NS", {
    answers: [
      {
        name: "confirm.example.com",
        ttl: 55,
        type: "NS",
        flush: false,
        data: "test.com",
      },
    ],
  });
});

add_task(async function test_connection_reuse_and_cycling() {
  Services.prefs.setCharPref(
    "network.trr.confirmationNS",
    "confirm.example.com"
  );
  setLocalModeAndURI(
    2,
    `https://foo.example.com:${trrServer.port()}/dns-query`
  );
  Services.prefs.setBoolPref("network.trr.strict_native_fallback", true);
  Services.prefs.setBoolPref("network.trr.retry_on_recoverable_errors", true);

  await TestUtils.waitForCondition(
    // 2 => CONFIRM_OK
    () => Services.dns.currentTrrConfirmationState == 2,
    `Timed out waiting for confirmation success. Currently ${Services.dns.currentTrrConfirmationState}`,
    1,
    5000
  );

  // Setting conncycle=true in the URI. Server will start logging reqs.
  // We will do a specific sequence of lookups, then fetch the log from
  // the server and check that it matches what we'd expect.
  setLocalModeAndURI(
    2,
    `https://foo.example.com:${trrServer.port()}/dns-query?conncycle=true`
  );
  await TestUtils.waitForCondition(
    // 2 => CONFIRM_OK
    () => Services.dns.currentTrrConfirmationState == 2,
    `Timed out waiting for confirmation success. Currently ${Services.dns.currentTrrConfirmationState}`,
    1,
    5000
  );
  // Confirmation upon uri-change will have created one req.

  async function registerDomain(domain) {
    await trrServer.registerDoHAnswers(domain, "A", {
      answers: [
        {
          name: domain,
          ttl: 55,
          type: "A",
          flush: false,
          data: "9.8.7.6",
        },
      ],
    });
  }

  for (let i = 1; i <= 6; i++) {
    await registerDomain(`bar${i}.example.org`);
  }
  await registerDomain("newconn.example.org");
  await registerDomain("newconn2.example.org");

  // Two reqs for each bar1 and bar2 - A + AAAA.
  await new TRRDNSListener("bar1.example.org", "9.8.7.6");
  await new TRRDNSListener("bar2.example.org", "9.8.7.6");
  // Total so far: (1) + 2 + 2 = 5

  // Two reqs that fail, one Confirmation req, two retried reqs that succeed.
  await new TRRDNSListener("newconn.example.org", "9.8.7.6");
  await TestUtils.waitForCondition(
    // 2 => CONFIRM_OK
    () => Services.dns.currentTrrConfirmationState == 2,
    `Timed out waiting for confirmation success. Currently ${Services.dns.currentTrrConfirmationState}`,
    1,
    5000
  );
  // Total so far: (5) + 2 + 1 + 2 = 10

  // Two reqs for each bar3 and bar4 .
  await new TRRDNSListener("bar3.example.org", "9.8.7.6");
  await new TRRDNSListener("bar4.example.org", "9.8.7.6");
  // Total so far: (10) + 2 + 2 = 14.

  // Two reqs that fail, one Confirmation req, two retried reqs that succeed.
  await new TRRDNSListener("newconn2.example.org", "9.8.7.6");
  await TestUtils.waitForCondition(
    // 2 => CONFIRM_OK
    () => Services.dns.currentTrrConfirmationState == 2,
    `Timed out waiting for confirmation success. Currently ${Services.dns.currentTrrConfirmationState}`,
    1,
    5000
  );
  // Total so far: (14) + 2 + 1 + 2 = 19

  // Two reqs for each bar5 and bar6 .
  await new TRRDNSListener("bar5.example.org", "9.8.7.6");
  await new TRRDNSListener("bar6.example.org", "9.8.7.6");
  // Total so far: (19) + 2 + 2 = 23

  let dohReqPortLog = await trrServer.execute(`global.gDoHPortsLog`);
  info(JSON.stringify(dohReqPortLog));

  // Since the actual ports seen will vary at runtime, we use placeholders
  // instead in our expected output definition. For example, if two entries
  // both have "port1", it means they both should have the same port in the
  // server's log.
  // For reqs that fail and trigger a Confirmation + retry, the retried reqs
  // might not re-use the new connection created for Confirmation due to a
  // race, so we have an extra alternate expected port for them. This lets
  // us test that they use *a* new port even if it's not *the* new port.
  // Subsequent lookups are not affected, they will use the same conn as
  // the Confirmation req.
  let expectedLogTemplate = [
    ["confirm.example.com", "port1"],
    ["bar1.example.org", "port1"],
    ["bar1.example.org", "port1"],
    ["bar2.example.org", "port1"],
    ["bar2.example.org", "port1"],
    ["newconn.example.org", "port1"],
    ["newconn.example.org", "port1"],
    ["confirm.example.com", "port2"],
    ["newconn.example.org", "port2"],
    ["newconn.example.org", "port2"],
    ["bar3.example.org", "port2"],
    ["bar3.example.org", "port2"],
    ["bar4.example.org", "port2"],
    ["bar4.example.org", "port2"],
    ["newconn2.example.org", "port2"],
    ["newconn2.example.org", "port2"],
    ["confirm.example.com", "port3"],
    ["newconn2.example.org", "port3"],
    ["newconn2.example.org", "port3"],
    ["bar5.example.org", "port3"],
    ["bar5.example.org", "port3"],
    ["bar6.example.org", "port3"],
    ["bar6.example.org", "port3"],
  ];

  if (expectedLogTemplate.length != dohReqPortLog.length) {
    // This shouldn't happen, and if it does, we'll fail the assertion
    // below. But first dump the whole server-side log to help with
    // debugging should we see a failure. Most likely cause would be
    // that another consumer of TRR happened to make a request while
    // the test was running and polluted the log.
    info(dohReqPortLog);
  }

  equal(
    expectedLogTemplate.length,
    dohReqPortLog.length,
    "Correct number of req log entries"
  );

  let seenPorts = new Set();
  // This is essentially a symbol table - as we iterate through the log
  // we will assign the actual seen port numbers to the placeholders.
  let seenPortsByExpectedPort = new Map();

  for (let i = 0; i < expectedLogTemplate.length; i++) {
    let expectedName = expectedLogTemplate[i][0];
    let expectedPort = expectedLogTemplate[i][1];
    let seenName = dohReqPortLog[i][0];
    let seenPort = dohReqPortLog[i][1];
    info(`Checking log entry. Name: ${seenName}, Port: ${seenPort}`);
    equal(expectedName, seenName, "Name matches for entry " + i);
    if (!seenPortsByExpectedPort.has(expectedPort)) {
      ok(!seenPorts.has(seenPort), "Port should not have been previously used");
      seenPorts.add(seenPort);
      seenPortsByExpectedPort.set(expectedPort, seenPort);
    } else {
      equal(
        seenPort,
        seenPortsByExpectedPort.get(expectedPort),
        "Connection was reused as expected"
      );
    }
  }
});
