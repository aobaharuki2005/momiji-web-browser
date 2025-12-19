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

Preferences.addAll([{ id: "browser.ml.chat.provider", type: "string" }]);

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
    ],
  },
});
