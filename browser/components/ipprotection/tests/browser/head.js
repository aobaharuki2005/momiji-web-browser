/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { IPProtectionPanel } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs"
);

const { IPProtectionWidget } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtection.sys.mjs"
);

const { IPProtection } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtection.sys.mjs"
);

const { HttpServer, HTTP_403 } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

// Adapted from devtools/client/performance-new/test/browser/helpers.js
function waitForPanelEvent(document, eventName) {
  return BrowserTestUtils.waitForEvent(document, eventName, false, event => {
    if (event.target.getAttribute("viewId") === "PanelUI-ipprotection") {
      return true;
    }
    return false;
  });
}
/* exported waitForPanelEvent */

const defaultState = new IPProtectionPanel().state;

/**
 * Opens the IP Protection panel with a given state, waits for the content to be ready
 * and returns the content element.
 *
 * @param {object} state - The state to set for the panel.
 * @param {Window} win - The window the panel should be opened in.
 * @returns {Promise<IPProtectionContentElement>} - The <ipprotection-content> element of the panel.
 */
async function openPanel(state = defaultState, win = window) {
  let panel = IPProtection.getPanel(win);
  panel.setState(state);

  IPProtection.openPanel(win);

  let panelShownPromise = waitForPanelEvent(win.document, "popupshown");
  let panelInitPromise = BrowserTestUtils.waitForEvent(
    win.document,
    "IPProtection:Init"
  );
  await Promise.all([panelShownPromise, panelInitPromise]);

  let panelView = PanelMultiView.getViewNode(
    win.document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);

  await content.updateComplete;

  return content;
}
/* exported openPanel */

/**
 * Sets the state of the IP Protection panel and waits for the content to be updated.
 *
 * @param {object} state - The state to set for the panel.
 * @param {Window} win - The window the panel is in.
 * @returns {Promise<void>}
 */
async function setPanelState(state = defaultState, win = window) {
  let panel = IPProtection.getPanel(win);
  panel.setState(state);

  let panelView = PanelMultiView.getViewNode(
    win.document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);

  await content.updateComplete;
}

/* exported setPanelState */

/**
 * Closes the IP Protection panel and resets the state to the default.
 *
 * @param {Window} win - The window the panel is in.
 * @returns {Promise<void>}
 */
async function closePanel(win = window) {
  // Reset the state
  let panel = IPProtection.getPanel(win);
  panel.setState(defaultState);
  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(win.document, "popuphidden");
  panel.close();
  await panelHiddenPromise;
}
/* exported closePanel */

/**
 * Creates a fake proxy server for testing.
 * Verifies that the server receives a CONNECT request with the expected headers.
 * Does not proxy anything really.
 * Given it refuses the proxy connection, it will be removed from as proxy-info of the channel.
 *
 * @param {*} testFn
 */
async function withProxyServer(testFn) {
  const server = new HttpServer();

  let { promise, resolve } = Promise.withResolvers();

  server.registerPathHandler("/", (request, response) => {
    if (request.host !== "example.com") {
      throw HTTP_403;
    }
    console.log("Received request:", request.method, request.path);
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("hello world");
    resolve();
  });

  server.registerPathHandler("CONNECT", (request, _response) => {
    console.log("Received request:", request.method, request.path);
    let hostHeader = request.getHeader("host");
    Assert.equal(
      hostHeader,
      "example.com:443",
      'Host header should be "example.com:443"'
    );
    Assert.equal(request.method, "CONNECT", "Request method should be CONNECT");

    resolve();
    // Close the connection after verification
    throw HTTP_403;
  });
  // If the Test is Trying to Proxy an http request
  // our server will get a GET request with that host.
  server.identity.add("http", "example.com", "80");
  server.identity.add("http", "example.com", "443");

  server.start(-1);
  await testFn({
    host: `localhost`,
    port: server.identity.primaryPort,
    type: "http",
    gotConnection: promise,
  });
  return server;
}
/* exported withProxyServer */
