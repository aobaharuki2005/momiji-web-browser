/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { InfoBar } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/InfoBar.sys.mjs"
);
const { CFRMessageProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/CFRMessageProvider.sys.mjs"
);
const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);
const { SpecialMessageActions } = ChromeUtils.importESModule(
  "resource://messaging-system/lib/SpecialMessageActions.sys.mjs"
);
const { RemoteL10n } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/RemoteL10n.sys.mjs"
);

const UNIVERSAL_MESSAGE = {
  id: "universal-infobar",
  content: {
    type: "universal",
    text: "t",
    buttons: [],
  },
};

const cleanupInfobars = () => {
  InfoBar._universalInfobars = [];
  InfoBar._activeInfobar = null;
};

const makeFakeWin = ({
  closed = false,
  toolbarVisible = true,
  taskbarTab = false,
  readyState = "complete",
  selectedBrowser,
} = {}) => {
  const win = {
    closed,
    toolbar: { visible: toolbarVisible },
    document: {
      readyState,
      documentElement: {
        hasAttribute: name => (name === "taskbartab" ? taskbarTab : false),
      },
    },
    gBrowser: { selectedBrowser },
  };

  const browser = { ownerGlobal: win, id: selectedBrowser };
  win.gBrowser = { selectedBrowser: browser };
  return win;
};

add_setup(async function () {
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(PrivateBrowsingUtils, "isWindowPrivate")
    .callsFake(win => !!win?.isPrivate);

  registerCleanupFunction(() => {
    sandbox.restore();
  });
});

add_task(async function showNotificationAllWindows() {
  const sandbox = sinon.createSandbox();
  let fakeNotification = { showNotification: sandbox.stub().resolves() };
  let fakeWins = [
    makeFakeWin({ selectedBrowser: "win1" }),
    makeFakeWin({ selectedBrowser: "win2" }),
    makeFakeWin({ selectedBrowser: "win3" }),
  ];

  sandbox.stub(InfoBar, "maybeLoadCustomElement");
  sandbox.stub(InfoBar, "maybeInsertFTL");

  let origWinManager = Services.wm;
  // Using sinon.stub won’t work here, because Services.wm is a frozen,
  // non-configurable object and its methods cannot be replaced via typical JS
  // property assignment.
  Object.defineProperty(Services, "wm", {
    value: { getEnumerator: () => fakeWins[Symbol.iterator]() },
    configurable: true,
    writable: true,
  });

  await InfoBar.showNotificationAllWindows(fakeNotification);

  Assert.equal(fakeNotification.showNotification.callCount, 3);
  Assert.equal(fakeNotification.showNotification.getCall(0).args[0].id, "win1");
  Assert.equal(fakeNotification.showNotification.getCall(1).args[0].id, "win2");
  Assert.equal(fakeNotification.showNotification.getCall(2).args[0].id, "win3");

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
  Object.defineProperty(Services, "wm", {
    value: origWinManager,
    configurable: true,
    writable: true,
  });
});

add_task(async function removeUniversalInfobars() {
  const sandbox = sinon.createSandbox();
  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let origBox = browser.ownerGlobal.gNotificationBox;
  browser.ownerGlobal.gNotificationBox = {
    appendNotification: sandbox.stub().resolves({}),
    removeNotification: sandbox.stub(),
  };

  sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notification => {
      await notification.showNotification(browser);
    });

  let notification = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    sandbox.stub()
  );

  Assert.equal(InfoBar._universalInfobars.length, 1);
  notification.removeUniversalInfobars();

  Assert.ok(
    browser.ownerGlobal.gNotificationBox.removeNotification.calledWith(
      notification.notification
    )
  );

  Assert.deepEqual(InfoBar._universalInfobars, []);

  // Cleanup
  cleanupInfobars();
  browser.ownerGlobal.gNotificationBox = origBox;
  sandbox.restore();
});

add_task(async function initialUniversal_showsAllWindows_andSendsTelemetry() {
  const sandbox = sinon.createSandbox();
  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let origBox = browser.ownerGlobal.gNotificationBox;
  browser.ownerGlobal.gNotificationBox = {
    appendNotification: sandbox.stub().resolves({}),
    removeNotification: sandbox.stub(),
  };

  let showAll = sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notification => {
      await notification.showNotification(browser);
    });

  let dispatch1 = sandbox.stub();
  let dispatch2 = sandbox.stub();

  await InfoBar.showInfoBarMessage(browser, UNIVERSAL_MESSAGE, dispatch1);
  await InfoBar.showInfoBarMessage(browser, UNIVERSAL_MESSAGE, dispatch2, true);

  Assert.ok(showAll.calledOnce);
  Assert.equal(InfoBar._universalInfobars.length, 2);

  // Dispatch impression (as this is the first universal infobar) and telemetry
  // ping
  Assert.equal(dispatch1.callCount, 2);

  // Do not send telemetry for subsequent appearance of the message
  Assert.equal(dispatch2.callCount, 0);

  // Cleanup
  cleanupInfobars();
  browser.ownerGlobal.gNotificationBox = origBox;
  sandbox.restore();
});

add_task(async function observe_domwindowopened_withLoadEvent() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();

  InfoBar._activeInfobar = {
    message: { content: { type: "universal" } },
    dispatch: sandbox.stub(),
  };

  let subject = makeFakeWin({ readyState: "loading", selectedBrowser: "b" });
  subject.addEventListener = function (event, cb) {
    subject.document.readyState = "complete";
    cb();
  };

  InfoBar.observe(subject, "domwindowopened");

  Assert.ok(stub.calledOnce);
  // Called with universalInNewWin true
  Assert.equal(stub.firstCall.args[3], true);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function observe_domwindowopened() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();

  InfoBar._activeInfobar = {
    message: { content: { type: "universal" } },
    dispatch: sandbox.stub(),
  };

  let win = BrowserWindowTracker.getTopWindow();
  InfoBar.observe(win, "domwindowopened");

  Assert.ok(stub.calledOnce);
  Assert.equal(stub.firstCall.args[3], true);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function observe_skips_nonUniversal() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();
  InfoBar._activeInfobar = {
    message: { content: { type: "global" } },
    dispatch: sandbox.stub(),
  };
  InfoBar.observe({}, "domwindowopened");
  Assert.ok(stub.notCalled);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function infobarCallback_dismissed_universal() {
  const sandbox = sinon.createSandbox();
  const browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  const dispatch = sandbox.stub();

  sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notif => await notif.showNotification(browser));

  let infobar = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    dispatch
  );
  // Reset the dispatch count to just watch for the DISMISSED ping
  dispatch.reset();

  infobar.infobarCallback("not‑removed‑event");

  Assert.equal(dispatch.callCount, 1);
  Assert.equal(dispatch.firstCall.args[0].data.event, "DISMISSED");
  Assert.deepEqual(InfoBar._universalInfobars, []);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function removeObserver_on_removeUniversalInfobars() {
  const sandbox = sinon.createSandbox();

  sandbox.stub(InfoBar, "showNotificationAllWindows").resolves();

  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let dispatch = sandbox.stub();

  // Show the universal infobar so it registers the observer
  let infobar = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    dispatch
  );
  Assert.ok(infobar, "Got an InfoBar notification");

  // Swap out Services.obs so removeObserver is spyable
  let origObs = Services.obs;
  let removeSpy = sandbox.spy();
  Services.obs = {
    addObserver: origObs.addObserver.bind(origObs),
    removeObserver: removeSpy,
    notifyObservers: origObs.notifyObservers.bind(origObs),
  };

  infobar.removeUniversalInfobars();

  Assert.ok(
    removeSpy.calledWith(InfoBar, "domwindowopened"),
    "removeObserver was invoked for domwindowopened"
  );

  // Cleanup
  Services.obs = origObs;
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function universalInfobar_persists_original_window_closure() {
  const sandbox = sinon.createSandbox();
  // Fake window so we can safely close it
  let fakeWindow = makeFakeWin({ selectedBrowser: "win1" });

  InfoBar._activeInfobar = {
    message: UNIVERSAL_MESSAGE,
    dispatch: sandbox.stub(),
  };
  InfoBar._universalInfobars = [
    { box: { ownerGlobal: fakeWindow }, notification: {} },
  ];

  Assert.ok(InfoBar._activeInfobar, "Got a universal infobar");

  // Mock closing the original window
  fakeWindow.closed = true;

  Assert.ok(
    InfoBar._activeInfobar,
    "_activeInfobar should persist through window closure"
  );

  let fakeNewWindow = makeFakeWin({ selectedBrowser: "win2" });

  makeFakeWin({ selectedBrowser: "win2" });

  let showInfobarStub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();
  InfoBar.observe(fakeNewWindow, "domwindowopened");
  Assert.ok(
    showInfobarStub.calledOnce,
    "New window should receive the universal infobar"
  );

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function test_universalInfobar_skips_popup_window() {
  const sandbox = sinon.createSandbox();
  const popupWin = makeFakeWin({
    toolbarVisible: false, // Simulate a popup window
    selectedBrowser: "popup-win",
  });

  const dispatch = sandbox.stub();
  const infobar = await InfoBar.showInfoBarMessage(
    popupWin.gBrowser.selectedBrowser,
    UNIVERSAL_MESSAGE,
    dispatch
  );

  Assert.equal(infobar, null, "Infobar not shown in popup window");
  Assert.equal(dispatch.callCount, 0, "No impression sent");

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function test_universalInfobar_skips_taskbar_window() {
  const sandbox = sinon.createSandbox();
  const win = BrowserWindowTracker.getTopWindow();
  win.document.documentElement.setAttribute("taskbartab", "");

  const dispatch = sandbox.stub();
  const infobar = await InfoBar.showInfoBarMessage(
    win.gBrowser.selectedBrowser,
    UNIVERSAL_MESSAGE,
    dispatch
  );

  Assert.equal(infobar, null, "Infobar not visible for taskbar-tab window");
  Assert.equal(dispatch.callCount, 0, "No impression sent");

  win.document.documentElement.removeAttribute("taskbartab");
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function universal_inline_anchor_dismiss_multiple_windows() {
  const sandbox = sinon.createSandbox();
  const win1 = BrowserWindowTracker.getTopWindow();
  const browser1 = win1.gBrowser.selectedBrowser;
  const win2 = await BrowserTestUtils.openNewBrowserWindow();
  const browser2 = win2.gBrowser.selectedBrowser;

  sandbox.stub(InfoBar, "maybeLoadCustomElement");
  sandbox.stub(InfoBar, "maybeInsertFTL");

  sandbox.stub(InfoBar, "showNotificationAllWindows").callsFake(async notif => {
    await notif.showNotification(browser1);
  });

  sandbox
    .stub(RemoteL10n, "formatLocalizableText")
    .resolves('<a data-l10n-name="test">Open</a>');

  const handle = sandbox.stub(SpecialMessageActions, "handleAction");

  const message = {
    id: "TEST_UNIVERSAL_INLINE_DISMISS_TWO_WINS",
    content: {
      type: "universal",
      text: { string_id: "test" },
      linkUrls: { test: "https://example.com/u" },
      linkActions: {
        test: {
          type: "SET_PREF",
          data: { pref: { name: "embedded-link-sma", value: true } },
          dismiss: true,
        },
      },
      buttons: [],
    },
  };

  const dispatch1 = sandbox.stub();
  const dispatch2 = sandbox.stub();

  await InfoBar.showInfoBarMessage(browser1, message, dispatch1);

  await InfoBar.showInfoBarMessage(
    browser2,
    message,
    dispatch2,
    true // universal in new window
  );

  const getNotification1 = () =>
    win1.gNotificationBox.getNotificationWithValue(message.id);
  const getNotification2 = () =>
    win2.gNotificationBox.getNotificationWithValue(message.id);

  await BrowserTestUtils.waitForCondition(
    () => !!getNotification1(),
    "Infobar present in window 1"
  );
  await BrowserTestUtils.waitForCondition(
    () => !!getNotification2(),
    "Infobar present in window 2"
  );

  // Ignore impression pings.
  dispatch1.resetHistory();
  dispatch2.resetHistory();

  const link = getNotification1().messageText.querySelector(
    'a[data-l10n-name="test"]'
  );
  Assert.ok(link, "Inline anchor exists in window 1");
  EventUtils.synthesizeMouseAtCenter(link, {}, win1);

  await BrowserTestUtils.waitForCondition(
    () => !getNotification1(),
    "Infobar removed in window 1"
  );
  await BrowserTestUtils.waitForCondition(
    () => !getNotification2(),
    "Infobar removed in window 2"
  );

  Assert.equal(handle.callCount, 2, "Two SMAs handled (OPEN_URL and SET_PREF)");

  Assert.ok(
    dispatch1.calledWith(
      sinon.match({
        type: "INFOBAR_TELEMETRY",
        data: sinon.match.has("event", "DISMISSED"),
      })
    ),
    "DISMISSED telemetry send from Infobar where link was clicked"
  );

  Assert.ok(
    !dispatch2.calledWith(
      sinon.match({
        type: "INFOBAR_TELEMETRY",
        data: sinon.match.has("event", "DISMISSED"),
      })
    ),
    "DISMISSED telemetry was not sent from other instance of the Infobar"
  );

  // Cleanup
  win2.close();
  sandbox.restore();
  cleanupInfobars();
});

add_task(async function universal_dismiss_on_pref_change_multiple_windows() {
  const sandbox = sinon.createSandbox();
  const PREF = "messaging-system-action.dismissOnChange.universal";

  const win1 = BrowserWindowTracker.getTopWindow();
  const browser1 = win1.gBrowser.selectedBrowser;
  const win2 = await BrowserTestUtils.openNewBrowserWindow();
  const browser2 = win2.gBrowser.selectedBrowser;

  sandbox.stub(InfoBar, "maybeLoadCustomElement");
  sandbox.stub(InfoBar, "maybeInsertFTL");

  sandbox.stub(InfoBar, "showNotificationAllWindows").callsFake(async notif => {
    await notif.showNotification(browser1);
  });

  const message = {
    id: "TEST_UNIVERSAL_DISMISS_ON_PREF_MULTI",
    content: {
      type: "universal",
      text: "universal pref change",
      dismissable: true,
      buttons: [],
      dismissOnPrefChange: PREF,
    },
  };

  const dispatch1 = sandbox.stub();
  const dispatch2 = sandbox.stub();

  await InfoBar.showInfoBarMessage(browser1, message, dispatch1);
  await InfoBar.showInfoBarMessage(browser2, message, dispatch2, true);

  const getInfobar1 = () =>
    win1.gNotificationBox.getNotificationWithValue(message.id);
  const getInfobart2 = () =>
    win2.gNotificationBox.getNotificationWithValue(message.id);

  await BrowserTestUtils.waitForCondition(
    () => !!getInfobar1(),
    "Infobar present in window 1"
  );
  await BrowserTestUtils.waitForCondition(
    () => !!getInfobart2(),
    "Infobar present in window 2"
  );

  // Ignore impression pings
  dispatch1.resetHistory();
  dispatch2.resetHistory();

  Services.prefs.setBoolPref(PREF, true);

  await BrowserTestUtils.waitForCondition(
    () => !getInfobar1(),
    "Infobar removed in window 1"
  );
  await BrowserTestUtils.waitForCondition(
    () => !getInfobart2(),
    "Infobar removed in window 2"
  );

  // Cleanup
  await BrowserTestUtils.closeWindow(win2);
  sandbox.restore();
  cleanupInfobars();
  Services.prefs.clearUserPref(PREF);
});
