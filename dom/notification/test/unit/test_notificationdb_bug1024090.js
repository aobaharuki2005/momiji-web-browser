"use strict";

add_setup(async function run_test() {
  do_get_profile();
});

// For bug 1024090: test edge case of notificationstore.json
add_task(async function test_bug1024090_purge() {
  const NOTIFICATION_STORE_PATH = PathUtils.join(
    PathUtils.profileDir,
    "notificationstore"
  );
  let cleanup = IOUtils.remove(NOTIFICATION_STORE_PATH, { recursive: true });
  await cleanup
    .then(
      function onSuccess() {
        ok(true, "Notification database cleaned.");
      },
      function onError(reason) {
        ok(false, "Notification database error when cleaning: " + reason);
      }
    )
    .then(function next() {
      info("Cleanup steps completed: " + NOTIFICATION_STORE_PATH);
      startNotificationDB();
    });
});

// Store one notification
add_task(async function test_bug1024090_send_one() {
  let requestID = 1;
  let msgReply = "Notification:Save:Return:OK";
  let msgHandler = function (message) {
    equal(requestID, message.data.requestID, "Checking requestID");
  };

  await addAndSend("Notification:Save", msgReply, msgHandler, {
    origin: systemNotification.origin,
    notification: systemNotification,
    requestID,
  });
});

// Get one notification, one exists
add_task(async function test_bug1024090_get_one() {
  let requestID = 2;
  let msgReply = "Notification:GetAll:Return:OK";
  let msgHandler = function (message) {
    equal(requestID, message.data.requestID, "Checking requestID");
    equal(1, message.data.notifications.length, "One notification stored");
  };

  await addAndSend("Notification:GetAll", msgReply, msgHandler, {
    origin: systemNotification.origin,
    requestID,
  });
});
