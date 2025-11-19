/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

document.l10n.setArgs(document.getElementById("title"), {
  profileName: window.arguments[0],
});

document.getElementById("dialog").addEventListener("dialogclosing", event => {
  window.arguments[1].button = event.detail.button;
});
