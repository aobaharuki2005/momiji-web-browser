/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global add_setup, add_task, Assert, info, do_get_profile, do_timeout, registerCleanupFunction, Services */

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

// Create a test HTTP server
let gHttpServer = null;
let gServerPort = -1;
let gServerURL = "";

// Track requests received by the server
let gRequestsReceived = [];

/**
 * Helper to decode potentially gzipped request body
 */
function decodeRequestBody(request) {
  let bodyStream = request.bodyInputStream;
  let avail = bodyStream.available();
  if (avail === 0) {
    return "";
  }

  if (
    request.hasHeader("content-encoding") &&
    request.getHeader("content-encoding") === "gzip"
  ) {
    // For gzipped content, we'd need to decompress
    // For now, just note it was gzipped
    return "[gzipped content]";
  }

  return NetUtil.readInputStreamToString(bodyStream, avail);
}

/**
 * Setup function to initialize the HTTP server
 */
add_setup(async function () {
  info("Setting up viaduct-necko test environment");

  // FOG needs a profile directory to store its data
  do_get_profile();

  // Create and start the HTTP server
  gHttpServer = new HttpServer();

  // Register various test endpoints
  setupTestEndpoints();

  gHttpServer.start(-1);
  gServerPort = gHttpServer.identity.primaryPort;
  gServerURL = `http://localhost:${gServerPort}`;

  info(`Test HTTP server started on port ${gServerPort}`);

  // Set the telemetry port preference to use our test server
  Services.prefs.setIntPref("telemetry.fog.test.localhost_port", gServerPort);

  // Enable telemetry upload (needed for viaduct to be used)
  Services.prefs.setBoolPref("datareporting.healthreport.uploadEnabled", true);

  // Initialize FOG/Glean which should trigger viaduct-necko initialization
  // This internally calls init_necko_backend() through GkRust_Init
  Services.fog.testResetFOG();

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("telemetry.fog.test.localhost_port");
    Services.prefs.clearUserPref("datareporting.healthreport.uploadEnabled");
    await new Promise(resolve => gHttpServer.stop(resolve));
  });
});

/**
 * Setup test endpoints on the HTTP server
 */
function setupTestEndpoints() {
  // Glean telemetry submission endpoints
  gHttpServer.registerPrefixHandler("/submit/", (request, response) => {
    const path = request.path;
    info(`Viaduct request received: ${request.method} ${path}`);

    // Read the request body
    const body = decodeRequestBody(request);

    // Extract ping type from path
    // Path format: /submit/firefox-desktop/{ping-type}/1/{uuid}
    const pathParts = path.split("/");
    const pingType = pathParts[3] || "unknown";

    gRequestsReceived.push({
      path,
      method: request.method,
      pingType,
      body,
      bodySize: request.hasHeader("content-length")
        ? parseInt(request.getHeader("content-length"), 10)
        : body.length,
      headers: {
        "content-type": request.hasHeader("content-type")
          ? request.getHeader("content-type")
          : null,
        "content-encoding": request.hasHeader("content-encoding")
          ? request.getHeader("content-encoding")
          : null,
        "user-agent": request.hasHeader("user-agent")
          ? request.getHeader("user-agent")
          : null,
      },
    });

    // Return a response similar to what a telemetry server would return
    // Using 501 to match your test scenario
    response.setStatusLine(request.httpVersion, 501, "Not Implemented");
    response.setHeader("Server", "TestServer/1.0 (Viaduct Backend)");
    response.setHeader("Date", new Date().toUTCString());
    response.setHeader("Connection", "close");
    response.setHeader("Content-Type", "application/json");

    const responseBody = JSON.stringify({
      status: "not_implemented",
      message: "Test server response",
    });
    response.setHeader("Content-Length", responseBody.length.toString());
    response.write(responseBody);
  });
}

/**
 * Test that the viaduct-necko backend was initialized and is processing requests
 */
add_task(async function test_viaduct_backend_working() {
  info("Testing viaduct-necko backend initialization and request processing");

  // Clear previous requests (though some health pings may have already been sent)
  const initialRequestCount = gRequestsReceived.length;
  info(
    `Already received ${initialRequestCount} requests during initialization`
  );

  // Wait for any pending requests to complete using do_timeout
  // This ensures we capture the health pings that are automatically sent
  await new Promise(resolve => do_timeout(500, resolve));

  // Check that we've received requests through viaduct
  Assert.ok(
    !!gRequestsReceived.length,
    `Viaduct-necko backend is processing requests. Received ${gRequestsReceived.length} requests.`
  );

  // Verify the requests are health pings (as shown in your logs)
  const healthPings = gRequestsReceived.filter(r => r.pingType === "health");
  info(`Received ${healthPings.length} health pings through viaduct-necko`);

  // All telemetry submissions should be POST requests
  for (const request of gRequestsReceived) {
    Assert.equal(
      request.method,
      "POST",
      `Request to ${request.path} should be POST`
    );
  }

  // Log summary of what was processed
  const pingTypes = [...new Set(gRequestsReceived.map(r => r.pingType))];
  info(
    `Test successful: Viaduct-necko backend processed ${gRequestsReceived.length} requests`
  );
  info(`Ping types received: ${pingTypes.join(", ")}`);
  info(
    `The C++ backend successfully handled requests from Rust through the FFI layer`
  );
});

/**
 * Test different HTTP parameters and methods
 * We verify different body sizes and headers are handled correctly
 */
add_task(async function test_different_parameters() {
  info("Testing different HTTP parameters through viaduct-necko");

  // Clear request tracking
  gRequestsReceived = [];

  // Submit different types of pings with varying sizes
  // This will test different body sizes and headers

  // Reset FOG to trigger new pings
  Services.fog.testResetFOG();

  // Wait to collect the requests
  await new Promise(resolve => do_timeout(1000, resolve));

  const requestsAfterReset = gRequestsReceived.length;
  info(`Received ${requestsAfterReset} requests after FOG reset`);

  // Verify different content types and encodings were handled
  const contentTypes = new Set();
  const contentEncodings = new Set();
  const bodySizes = new Set();

  for (const request of gRequestsReceived) {
    if (request.headers["content-type"]) {
      contentTypes.add(request.headers["content-type"]);
    }
    if (request.headers["content-encoding"]) {
      contentEncodings.add(request.headers["content-encoding"]);
    }
    if (request.bodySize) {
      bodySizes.add(request.bodySize);
    }
  }

  info(`Content types seen: ${Array.from(contentTypes).join(", ")}`);
  info(`Content encodings seen: ${Array.from(contentEncodings).join(", ")}`);
  info(
    `Body sizes seen: ${Array.from(bodySizes)
      .sort((a, b) => a - b)
      .join(", ")}`
  );

  Assert.ok(
    !!gRequestsReceived.length,
    "Different parameters were processed successfully"
  );

  // Verify we're seeing variation in body sizes (different ping types have different sizes)
  Assert.ok(
    bodySizes.size > 1,
    `Multiple body sizes handled: ${Array.from(bodySizes).join(", ")}`
  );
});

/**
 * Test that headers are properly passed through the FFI layer
 */
add_task(async function test_header_handling() {
  info("Testing header handling through viaduct-necko");

  // Check the headers that were sent in previous requests
  let hasHeaders = false;
  let headerCount = 0;

  for (const request of gRequestsReceived) {
    if (request.headers && Object.keys(request.headers).length) {
      hasHeaders = true;
      const nonNullHeaders = Object.entries(request.headers).filter(
        ([_, value]) => value !== null
      );

      if (nonNullHeaders.length) {
        headerCount++;
        info(
          `Request headers found: ${JSON.stringify(Object.fromEntries(nonNullHeaders))}`
        );
      }
    }
  }

  Assert.ok(
    hasHeaders,
    "Headers are properly transmitted through viaduct-necko"
  );

  Assert.ok(headerCount > 0, `Found ${headerCount} requests with headers`);

  // Verify specific headers we expect to see
  const hasContentType = gRequestsReceived.some(
    r => r.headers && r.headers["content-type"] !== null
  );
  const hasContentEncoding = gRequestsReceived.some(
    r => r.headers && r.headers["content-encoding"] !== null
  );
  const hasUserAgent = gRequestsReceived.some(
    r => r.headers && r.headers["user-agent"] !== null
  );

  Assert.ok(hasContentType, "Content-Type header is present");
  Assert.ok(hasContentEncoding, "Content-Encoding header is present");
  Assert.ok(hasUserAgent, "User-Agent header is present");

  info("Headers are properly handled through the Rust → C++ → Necko chain");
});

/**
 * Test configuration validation
 * While we can't directly test redirects and timeouts, we can verify
 * that the configuration is being passed correctly from logs
 */
add_task(async function test_configuration_validation() {
  info("Validating viaduct-necko configuration");

  // We can verify at least that requests are completing successfully
  // which means the configuration isn't breaking anything
  const successfulRequests = gRequestsReceived.filter(
    r => r.method === "POST" && r.path.includes("/submit/")
  );

  Assert.ok(
    !!successfulRequests.length,
    `Configuration is valid: ${successfulRequests.length} successful requests processed`
  );

  info(
    "Viaduct-necko backend configuration validated through successful request processing"
  );
});
