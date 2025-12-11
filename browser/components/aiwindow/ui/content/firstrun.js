/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const SMART_ASSIST_URL = "chrome://browser/content/genai/smartAssist.html";

const AI_WINDOW_CONFIG = {
  id: "AI_WINDOW_WELCOME",
  template: "spotlight",
  transitions: true,
  modal: "tab",
  backdrop:
    "radial-gradient(circle at 50% 90%, rgba(253, 244, 243, 1) 0%, rgba(253, 244, 243, 1) 30%, rgba(216, 202, 247, 1) 100%)",
  screens: [
    {
      id: "AW_AI_WINDOW_WELCOME",
      auto_advance: "primary_button",
      content: {
        fullscreen: true,
        hide_secondary_section: "responsive",
        position: "center",
        paddingBottom: "0px",
        background: "transparent",
        screen_style: {
          overflow: "hidden",
        },
        title: {
          fontWeight: 400,
          fontSize: "39px",
          lineHeight: "56px",
          textAlign: "center",
          string_id: "aiwindow-firstrun-title",
          color: "transparent",
          letterSpacing: "0px",
        },
        primary_button: {
          label: "",
          action: {
            navigate: true,
          },
        },
      },
    },
  ],
};

function renderFirstRun() {
  window.AWGetFeatureConfig = () => AI_WINDOW_CONFIG;
  window.AWEvaluateScreenTargeting = screens => screens;
  window.AWGetSelectedTheme = () => ({});
  window.AWGetInstalledAddons = () => [];
  window.AWFinish = () => {
    window.location.href = SMART_ASSIST_URL;
  };

  const script = document.createElement("script");
  script.src = "chrome://browser/content/aboutwelcome/aboutwelcome.bundle.js";
  document.body.appendChild(script);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderFirstRun, { once: true });
} else {
  renderFirstRun();
}
