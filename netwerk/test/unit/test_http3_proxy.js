/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from head_cache.js */
/* import-globals-from head_cookies.js */
/* import-globals-from head_channels.js */
/* import-globals-from head_servers.js */

function makeChan(uri) {
  let chan = NetUtil.newChannel({
    uri,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
  chan.loadFlags = Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
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

let proxyHost;
let proxyPort;
let proxyAuth;

/**
 * Sets up proxy filter to MASQUE H3 proxy
 */
add_setup(async function setup() {
  Services.prefs.setBoolPref("network.proxy.allow_hijacking_localhost", true);
  Services.prefs.setBoolPref("network.dns.disableIPv6", true);
  Services.prefs.setIntPref("network.webtransport.datagram_size", 1500);
  Services.prefs.setCharPref("network.dns.localDomains", "foo.example.com");
  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );
  addCertFromFile(certdb, "http2-ca.pem", "CTu,u,u");

  proxyHost = "foo.example.com";
  proxyPort = Services.env.get("MOZHTTP3_PORT_MASQUE");
  proxyAuth = "";

  // A dummy request to make sure AltSvcCache::mStorage is ready.
  let chan = makeChan(`https://localhost`);
  await channelOpenPromise(chan, CL_EXPECT_FAILURE);

  const pps = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService();
  let filter = new NodeProxyFilter(
    "connect-udp",
    proxyHost,
    proxyPort,
    0,
    "/.well-known/masque/udp/{target_host}/{target_port}/",
    proxyAuth
  );
  pps.registerFilter(filter, 10);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("network.proxy.allow_hijacking_localhost");
  });
});

/**
 * Tests HTTP connect through H3 proxy to HTTP, HTTPS and H2 servers
 * Makes multiple requests. Expects success.
 */
add_task(async function test_http_connect() {
  await with_node_servers(
    [NodeHTTPServer, NodeHTTPSServer, NodeHTTP2Server],
    async server => {
      info(`Proxying to ${server.constructor.name} server`);
      await server.registerPathHandler("/first", (req, resp) => {
        resp.writeHead(200);
        resp.end("first");
      });
      await server.registerPathHandler("/second", (req, resp) => {
        resp.writeHead(200);
        resp.end("second");
      });
      await server.registerPathHandler("/third", (req, resp) => {
        resp.writeHead(200);
        resp.end("third");
      });
      let chan = makeChan(
        `${server.protocol()}://alt1.example.com:${server.port()}/first`
      );
      let [req, buf] = await channelOpenPromise(
        chan,
        CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
      );
      Assert.equal(req.status, Cr.NS_OK);
      Assert.equal(buf, "first");
      chan = makeChan(
        `${server.protocol()}://alt1.example.com:${server.port()}/second`
      );
      [req, buf] = await channelOpenPromise(
        chan,
        CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
      );
      Assert.equal(req.status, Cr.NS_OK);
      Assert.equal(buf, "second");

      chan = makeChan(
        `${server.protocol()}://alt1.example.com:${server.port()}/third`
      );
      [req, buf] = await channelOpenPromise(
        chan,
        CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
      );
      Assert.equal(req.status, Cr.NS_OK);
      Assert.equal(buf, "third");
    }
  );
});

/**
 * Test HTTP CONNECT authentication failure - tests behavior when proxy
 * authentication is required but not provided or incorrect
 */
add_task(async function test_http_connect_auth_failure() {
  await with_node_servers(
    [NodeHTTPServer, NodeHTTPSServer, NodeHTTP2Server],
    async server => {
      info(`Testing auth failure with ${server.constructor.name} server`);
      // Register a handler that requires authentication
      await server.registerPathHandler("/auth-required", (req, resp) => {
        const auth = req.headers.authorization;
        if (!auth || auth !== "Basic dGVzdDp0ZXN0") {
          resp.writeHead(401, {
            "WWW-Authenticate": 'Basic realm="Test Realm"',
            "Content-Type": "text/plain",
          });
          resp.end("");
        } else {
          resp.writeHead(200);
          resp.end("Authenticated");
        }
      });

      let chan = makeChan(
        `${server.protocol()}://alt1.example.com:${server.port()}/auth-required`
      );
      let [req, buf] = await channelOpenPromise(
        chan,
        CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
      );

      // Should receive 401 Unauthorized through the tunnel
      Assert.equal(req.status, Cr.NS_OK);
      Assert.equal(req.QueryInterface(Ci.nsIHttpChannel).responseStatus, 401);
    }
  );
});

/**
 * Test HTTP CONNECT with large request/response data - ensures the tunnel
 * can handle substantial data transfer without corruption or truncation
 */
add_task(async function test_http_connect_large_data() {
  await with_node_servers(
    [
      // NodeHTTPServer, // TODO: this one hangs.
      NodeHTTPSServer,
      NodeHTTP2Server,
    ],
    async server => {
      info(
        `Testing large data transfer with ${server.constructor.name} server`
      );
      // Create a large response payload (1MB of data)
      const largeData = "x".repeat(1024 * 1024);
      await server.registerPathHandler("/large", (req, resp) => {
        const largeData = "x".repeat(1024 * 1024);
        resp.writeHead(200, { "Content-Type": "text/plain" });
        resp.end(largeData);
      });

      let chan = makeChan(
        `${server.protocol()}://alt1.example.com:${server.port()}/large`
      );
      let [req, buf] = await channelOpenPromise(
        chan,
        CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
      );

      Assert.equal(req.status, Cr.NS_OK);
      Assert.equal(buf.length, largeData.length);
      Assert.equal(buf, largeData);
    }
  );
});

/**
 * Test HTTP CONNECT tunnel connection refused - simulates target server
 * being unreachable or refusing connections
 */
add_task(async function test_http_connect_connection_refused() {
  // Test connecting to a port that's definitely not in use
  let chan = makeChan(`http://alt1.example.com:667/refused`);
  let [req, buf] = await channelOpenPromise(chan, CL_EXPECT_FAILURE);

  // Should fail to establish tunnel connection
  Assert.notEqual(req.status, Cr.NS_OK);
  info(`Connection refused status: ${req.status}`);
});

/**
 * Test HTTP CONNECT with invalid target host - verifies proper error handling
 * when trying to tunnel to a non-existent hostname
 */
add_task(async function test_http_connect_invalid_host() {
  let chan = makeChan(`http://nonexistent.invalid.example/test`);
  let [req, buf] = await channelOpenPromise(chan, CL_EXPECT_FAILURE);

  // Should fail DNS resolution for invalid hostname
  Assert.notEqual(req.status, Cr.NS_OK);
  info(`Invalid host status: ${req.status}`);
});

/**
 * Test concurrent HTTP CONNECT tunnels - ensures multiple simultaneous
 * requests can be established and used independently through the same H3 proxy
 */
add_task(async function test_concurrent_http_connect_tunnels() {
  await with_node_servers(
    [NodeHTTPServer, NodeHTTPSServer, NodeHTTP2Server],
    async server => {
      info(`Testing concurrent tunnels with ${server.constructor.name} server`);

      // Register multiple endpoints
      await server.registerPathHandler("/concurrent1", (req, resp) => {
        resp.writeHead(200);
        resp.end("response1");
      });
      await server.registerPathHandler("/concurrent2", (req, resp) => {
        resp.writeHead(200);
        resp.end("response2");
      });
      await server.registerPathHandler("/concurrent3", (req, resp) => {
        resp.writeHead(200);
        resp.end("response3");
      });

      // Create multiple concurrent requests through the tunnel
      const promises = [];
      for (let i = 1; i <= 3; i++) {
        let chan = makeChan(
          `${server.protocol()}://alt1.example.com:${server.port()}/concurrent${i}`
        );
        promises.push(
          channelOpenPromise(chan, CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL)
        );
      }

      const results = await Promise.all(promises);

      // Verify all requests succeeded with correct responses
      for (let i = 0; i < 3; i++) {
        const [req, buf] = results[i];
        Assert.equal(req.status, Cr.NS_OK);
        Assert.equal(buf, `response${i + 1}`);
      }
      info("All concurrent tunnels completed successfully");
    }
  );
});

/**
 * Test HTTP CONNECT tunnel stream closure handling - verifies proper cleanup
 * when the tunnel connection is closed unexpectedly
 */
add_task(async function test_http_connect_stream_closure() {
  await with_node_servers([NodeHTTPServer], async server => {
    info(`Testing stream closure with ${server.constructor.name} server`);

    await server.registerPathHandler("/close", (req, resp) => {
      // Send partial response then close connection abruptly
      resp.writeHead(200, { "Content-Type": "text/plain" });
      resp.write("partial");
      // Simulate connection closure
      resp.destroy();
    });

    let chan = makeChan(
      `${server.protocol()}://alt1.example.com:${server.port()}/close`
    );
    let [req, buf] = await channelOpenPromise(chan, CL_EXPECT_FAILURE);

    // Should handle connection closure gracefully
    Assert.notEqual(req.status, Cr.NS_OK);
    info(`Stream closure status: ${req.status}`);
  });
}).skip(
  "TODO: Proxy needs to close the stream properly when socket failures occur"
);

/**
 * Test connect-udp - SUCCESS case.
 * Will use h3 proxy to connect to h3 server.
 */
add_task(async function test_connect_udp() {
  let h3Port = Services.env.get("MOZHTTP3_PORT");
  console.log(`h3Port = ${h3Port}`);

  let server = new NodeHTTPSServer();
  await server.start(h3Port);
  registerCleanupFunction(async () => {
    await server.stop();
  });

  Services.prefs.setCharPref(
    "network.http.http3.alt-svc-mapping-for-testing",
    `alt1.example.com;h3=:${h3Port}`
  );

  {
    let chan = makeChan(`https://alt1.example.com:${h3Port}/no_body`);
    let [req, buf] = await channelOpenPromise(
      chan,
      CL_IGNORE_CL | CL_ALLOW_UNKNOWN_CL
    );
    Assert.equal(req.protocolVersion, "h3");
    Assert.equal(req.status, Cr.NS_OK);
    Assert.equal(req.responseStatus, 200);
  }
});
