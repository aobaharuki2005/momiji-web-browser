/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test Resource Timing Level 3 interim response timestamps with HTTP/3
// https://www.w3.org/TR/resource-timing/#interim-response-times

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const earlyhintspath = "/103_response";

add_setup(async function () {
  await http3_setup_tests("h3");
});

function makeChan(url) {
  let chan = NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_DOCUMENT,
  }).QueryInterface(Ci.nsIHttpChannel);
  return chan;
}

function channelOpenPromise(chan, flags) {
  return new Promise(resolve => {
    function finish(req, buffer) {
      resolve([req, buffer]);
    }
    chan.asyncOpen(new ChannelListener(finish, null, flags));
  });
}

// Test HTTP/3 request without interim response (no 103 Early Hints)
add_task(async function test_http3_no_interim_response() {
  Services.obs.notifyObservers(null, "net:prune-all-connections");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  let chan = makeChan(`https://foo.example.com`);
  let [req] = await channelOpenPromise(chan);

  // Verify it's HTTP/3
  let httpVersion = "";
  try {
    httpVersion = req.protocolVersion;
  } catch (e) {}
  Assert.equal(httpVersion, "h3", "Request should use HTTP/3");

  let timing = req.QueryInterface(Ci.nsITimedChannel);

  // When there's no interim response:
  // - firstInterimResponseStart should be 0 (computed)
  // - responseStart should equal finalResponseHeadersStart

  // Compute firstInterimResponseStart the same way Performance API does
  let firstInterimResponseStart = 0;
  if (
    timing.responseStartTime > 0 &&
    timing.finalResponseHeadersStartTime > 0 &&
    timing.responseStartTime < timing.finalResponseHeadersStartTime
  ) {
    firstInterimResponseStart = timing.responseStartTime;
  }

  Assert.equal(
    firstInterimResponseStart,
    0,
    "firstInterimResponseStart should be 0 when no interim response"
  );

  Assert.greater(timing.responseStartTime, 0, "responseStart should be set");
  Assert.greater(
    timing.finalResponseHeadersStartTime,
    0,
    "finalResponseHeadersStart should be set"
  );

  // responseStart should approximately equal finalResponseHeadersStart
  // (they're set to the same TimeStamp in the code)
  let timeDiff = Math.abs(
    timing.responseStartTime - timing.finalResponseHeadersStartTime
  );
  Assert.less(
    timeDiff,
    10,
    "responseStart and finalResponseHeadersStart should be approximately equal when no interim response"
  );
});

// Test HTTP/3 request with interim response (103 Early Hints)
add_task(async function test_http3_with_interim_response() {
  Services.obs.notifyObservers(null, "net:prune-all-connections");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  let chan = makeChan(`https://foo.example.com${earlyhintspath}`);
  // Request 103 Early Hints
  chan.setRequestHeader(
    "link-to-set",
    "</style.css>; rel=preload; as=style",
    false
  );

  let [req] = await channelOpenPromise(chan);

  // Verify it's HTTP/3
  let httpVersion = "";
  try {
    httpVersion = req.protocolVersion;
  } catch (e) {}
  Assert.equal(httpVersion, "h3", "Request should use HTTP/3");

  let timing = req.QueryInterface(Ci.nsITimedChannel);

  // When there's an interim response (103 Early Hints):
  // - firstInterimResponseStart should be > 0 (computed)
  // - responseStart should equal firstInterimResponseStart
  // - finalResponseHeadersStart should be >= firstInterimResponseStart

  // Compute firstInterimResponseStart the same way Performance API does
  let firstInterimResponseStart = 0;
  if (
    timing.responseStartTime > 0 &&
    timing.finalResponseHeadersStartTime > 0 &&
    timing.responseStartTime < timing.finalResponseHeadersStartTime
  ) {
    firstInterimResponseStart = timing.responseStartTime;
  }

  Assert.greater(
    firstInterimResponseStart,
    0,
    "firstInterimResponseStart should be set when interim response received"
  );

  Assert.greater(timing.responseStartTime, 0, "responseStart should be set");
  Assert.greater(
    timing.finalResponseHeadersStartTime,
    0,
    "finalResponseHeadersStart should be set"
  );

  // responseStart should equal firstInterimResponseStart (computed from responseStart)
  Assert.equal(
    timing.responseStartTime,
    firstInterimResponseStart,
    "responseStart should equal firstInterimResponseStart when interim response received"
  );

  // Timing order should be: firstInterimResponseStart <= finalResponseHeadersStart
  Assert.lessOrEqual(
    firstInterimResponseStart,
    timing.finalResponseHeadersStartTime,
    "firstInterimResponseStart should be before or equal to finalResponseHeadersStart"
  );
});

// Test timing ordering with HTTP/3 and interim response
add_task(async function test_http3_timing_order() {
  Services.obs.notifyObservers(null, "net:prune-all-connections");
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  let chan = makeChan(`https://foo.example.com${earlyhintspath}`);
  chan.setRequestHeader(
    "link-to-set",
    "</img.png>; rel=preload; as=image",
    false
  );

  let [req] = await channelOpenPromise(chan);
  let timing = req.QueryInterface(Ci.nsITimedChannel);

  // Compute firstInterimResponseStart
  let firstInterimResponseStart = 0;
  if (
    timing.responseStartTime > 0 &&
    timing.finalResponseHeadersStartTime > 0 &&
    timing.responseStartTime < timing.finalResponseHeadersStartTime
  ) {
    firstInterimResponseStart = timing.responseStartTime;
  }

  // Verify complete timing order:
  // requestStart <= firstInterimResponseStart <= finalResponseHeadersStart <= responseEnd
  Assert.greater(timing.requestStartTime, 0, "requestStart should be set");
  Assert.lessOrEqual(
    timing.requestStartTime,
    firstInterimResponseStart,
    "requestStart should be before or equal to firstInterimResponseStart"
  );
  Assert.lessOrEqual(
    firstInterimResponseStart,
    timing.finalResponseHeadersStartTime,
    "firstInterimResponseStart should be before or equal to finalResponseHeadersStart"
  );
  Assert.lessOrEqual(
    timing.finalResponseHeadersStartTime,
    timing.responseEndTime,
    "finalResponseHeadersStart should be before or equal to responseEnd"
  );
});

registerCleanupFunction(async () => {
  http3_clear_prefs();
});
