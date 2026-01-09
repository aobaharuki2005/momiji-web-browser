/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

const XPCOMUtils = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
).XPCOMUtils;
const lazy = XPCOMUtils.declareLazy({
  GenAI: "resource:///modules/GenAI.sys.mjs",
});

Preferences.addAll([
  { id: "browser.ml.chat.provider", type: "string" },
  { id: "browser.aiwindow.enabled", type: "bool" },
  { id: "browser.aiwindow.preferences.enabled", type: "bool" },
]);

Preferences.addSetting({ id: "chatbotProviderItem" });
Preferences.addSetting({
  id: "chatbotProvider",
  pref: "browser.ml.chat.provider",
  setup() {
    lazy.GenAI.init();
  },
  getControlConfig(config, _, setting) {
    let providerUrl = setting.value;
    let isKnownProvider = providerUrl == "";
    let options = [config.options[0]];
    lazy.GenAI.chatProviders.forEach((provider, url) => {
      let isSelected = url == providerUrl;
      // @ts-expect-error provider.hidden isn't in the typing
      if (!isSelected && provider.hidden) {
        return;
      }
      isKnownProvider = isKnownProvider || isSelected;
      options.push({
        value: url,
        controlAttrs: { label: provider.name },
      });
    });
    if (!isKnownProvider) {
      options.push({
        value: providerUrl,
        controlAttrs: { label: providerUrl },
      });
    }
    return {
      ...config,
      options,
    };
  },
});

Preferences.addSetting({
  id: "AIWindowEnabled",
  pref: "browser.aiwindow.enabled",
});

Preferences.addSetting({
  id: "AIWindowPreferencesEnabled",
  pref: "browser.aiwindow.preferences.enabled",
});

// Only show the feature settings if the prefs are allowed to show and the
// feature isn't enabled.
Preferences.addSetting({
  id: "AIWindowItem",
  deps: ["AIWindowEnabled", "AIWindowPreferencesEnabled"],
  visible: deps => {
    return deps.AIWindowPreferencesEnabled.value && !deps.AIWindowEnabled.value;
  },
});
Preferences.addSetting({ id: "AIWindowHeader" });
Preferences.addSetting({ id: "AIWindowActivateLink" });

// Only show the AI Window features if the prefs are allowed to show and the
// feature is enabled.
// TODO: Enable when Model and Insight options are added
Preferences.addSetting({
  id: "aiFeaturesAIWindowGroup",
  deps: ["AIWindowEnabled", "AIWindowPreferencesEnabled"],
  visible: deps => {
    return deps.AIWindowPreferencesEnabled.value && deps.AIWindowEnabled.value;
  },
});

SettingGroupManager.registerGroups({
  aiFeatures: {
    l10nId: "try-ai-features-group",
    items: [
      {
        id: "chatbotProviderItem",
        control: "moz-box-item",
        items: [
          {
            id: "chatbotProvider",
            l10nId: "try-ai-features-chatbot-provider",
            control: "moz-select",
            supportPage: "ai-chatbot",
            options: [
              {
                l10nId: "try-ai-features-chatbot-choose-label",
                value: "",
              },
            ],
          },
        ],
      },
      {
        id: "AIWindowItem",
        control: "moz-box-group",
        items: [
          {
            id: "AIWindowHeader",
            l10nId: "try-ai-features-ai-window",
            control: "moz-box-item",
          },
          {
            id: "AIWindowActivateLink",
            l10nId: "try-ai-features-ai-window-activate-link",
            control: "moz-box-link",
          },
        ],
      },
    ],
  },
  aiWindowFeatures: {
    l10nId: "ai-window-features-group",
    headingLevel: 2,
    items: [
      {
        id: "aiFeaturesAIWindowGroup",
        control: "moz-box-group",
        // TODO: Add Model and Insight list
        // options: [
        // ],
      },
    ],
  },
});
