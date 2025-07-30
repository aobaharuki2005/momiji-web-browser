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
