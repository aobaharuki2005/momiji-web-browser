/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contextual-password-manager.enabled", true],
      ["signon.rememberSignons", true],
    ],
  });
  registerCleanupFunction(() => {
    LoginTestUtils.clearData();
    Services.prefs.clearUserPref("sidebar.new-sidebar.has-used");
  });
});

add_task(async function test_notification_is_only_shown_in_triggered_window() {
  const login = TEST_LOGIN_1;
  await LoginTestUtils.addLogin(login);

  const megalist = await openPasswordsSidebar();
  await checkAllLoginsUpdated(megalist);

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: false });
  const megalistNewWindow = await openPasswordsSidebar(win);
  await checkAllLoginsUpdated(megalistNewWindow);

  let list = megalist.querySelector(".passwords-list");
  let passwordCard = list.shadowRoot.querySelector(".item password-card");
  await waitForReauth(() => passwordCard.editBtn.click());
  await BrowserTestUtils.waitForCondition(
    () => megalist.querySelector("login-form"),
    "Login form failed to render"
  );

  info("Cancelling form.");
  const loginForm = megalist.querySelector("login-form");

  // Only show the discard changes notification if the login form has been modified.
  setInputValue(loginForm, "login-username-field", login.username + "added");

  const cancelButton = loginForm.shadowRoot.querySelector(
    "moz-button[data-l10n-id=login-item-cancel-button]"
  );
  cancelButton.buttonEl.click();
  const notifMsgBar = await checkNotificationAndTelemetry(
    megalist,
    "discard-changes"
  );
  ok(true, "Got discard changes notification");

  await ensureNoNotifications(megalistNewWindow, "discard-changes");

  SidebarController.hide();
  win.SidebarController.hide();
  notifMsgBar.shadowRoot
    .querySelector("moz-button[type='destructive']")
    .click();

  await BrowserTestUtils.closeWindow(win);
});
