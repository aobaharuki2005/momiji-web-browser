"use strict";

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

function getNotificationObject(app, id, tag, includeScope) {
  const origin = `https://${app}.gaiamobile.org/`;
  return {
    origin,
    id,
    title: app + "Notification:" + Date.now(),
    dir: "auto",
    lang: "",
    body: app + " notification body",
    tag: tag || "",
    icon: "icon.png",
    serviceWorkerRegistrationScope: includeScope ? origin : undefined,
  };
}

var systemNotification = getNotificationObject(
  "system",
  "{2bc883bf-2809-4432-b0f4-f54e10372764}"
);

var calendarNotification = getNotificationObject(
  "calendar",
  "{d8d11299-a58e-429b-9a9a-57c562982fbf}"
);

// Helper to start the NotificationDB
function startNotificationDB() {
  ChromeUtils.importESModule(
    "moz-src:///dom/notification/MemoryNotificationDB.sys.mjs"
  );
  ChromeUtils.importESModule(
    "moz-src:///dom/notification/NotificationDB.sys.mjs"
  );
}

// Helper function to add a listener, send message and treat the reply
async function addAndSend(msg, reply, callback, payload) {
  const { promise, resolve, reject } = Promise.withResolvers();
  let handler = {
    receiveMessage(message) {
      if (message.name === reply) {
        Services.cpmm.removeMessageListener(reply, handler);
        Promise.resolve(callback(message)).then(resolve, reject);
      }
    },
  };
  Services.cpmm.addMessageListener(reply, handler);
  Services.cpmm.sendAsyncMessage(msg, payload);
  return promise;
}

// helper fonction, comparing two notifications
function compareNotification(notif1, notif2) {
  // retrieved notification should be the second one sent
  for (let prop in notif1) {
    // compare each property
    Assert.equal(notif1[prop], notif2[prop], `${prop} should be equal`);
  }
}
