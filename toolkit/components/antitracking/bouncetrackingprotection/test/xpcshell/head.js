/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(function () {
  // BTP needs a temporary profile for storage.
  do_get_profile();

  // Simulate profile-after-change to remove BTP init gate. do_get_profile(true)
  // can dispatch this, but it won't reach BTP because it goes through the
  // regular observer service and not the category manager. So we do it
  // manually.
  let pacGate = Cc["@mozilla.org/profile-after-change-gate;1"].getService(
    Ci.nsIObserver
  );
  pacGate.observe(null, "profile-after-change", null);
});
