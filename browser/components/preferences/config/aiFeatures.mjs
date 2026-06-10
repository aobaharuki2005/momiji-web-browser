/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { OnDeviceModelManager } from "chrome://browser/content/preferences/OnDeviceModelManager.mjs";

/**
 * @import { OnDeviceModelFeaturesEnum } from "chrome://browser/content/preferences/OnDeviceModelManager.mjs"
 */

const XPCOMUtils = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
).XPCOMUtils;
const lazy = XPCOMUtils.declareLazy({
  GenAI: "resource:///modules/GenAI.sys.mjs",
  log: () =>
    console.createInstance({
      prefix: "aiFeatures",
      maxLogLevel: "Info",
    }),
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
Preferences.addSetting(
  /** @type {{ selected: string } & SettingConfig} */ ({
    id: "onDeviceModel",
    selected: Object.values(OnDeviceModelManager.features)[0],
    getControlConfig(config) {
      if (!config.options) {
        config.options = Object.entries(OnDeviceModelManager.features).map(
          ([key, value]) => ({
            value,
            controlAttrs: { label: key },
          })
        );
      }
      return config;
    },
    get() {
      return this.selected;
    },
    set(val) {
      this.selected = String(val);
    },
  })
);
Preferences.addSetting({
  id: "onDeviceModelInstall",
  deps: ["onDeviceModel"],
  async onUserClick(_, deps) {
    let feature = /** @type {OnDeviceModelFeaturesEnum} */ (
      deps.onDeviceModel.value
    );
    lazy.log.info("Will install: ", feature);
    await OnDeviceModelManager.install(feature);
    lazy.log.info("Done install: ", feature);
  },
});
Preferences.addSetting({
  id: "onDeviceModelUninstall",
  deps: ["onDeviceModel"],
  async onUserClick(_, deps) {
    let feature = /** @type {OnDeviceModelFeaturesEnum} */ (
      deps.onDeviceModel.value
    );
    lazy.log.info("Will uninstall: ", feature);
    await OnDeviceModelManager.uninstall(feature);
    lazy.log.info("Done uninstall: ", feature);
  },
});
Preferences.addSetting({
  id: "onDeviceModelUninstallAll",
  async onUserClick() {
    lazy.log.info("Will uninstall: ALL");
    await Promise.all(
      Object.values(OnDeviceModelManager.features).map(feature =>
        OnDeviceModelManager.uninstall(feature)
      )
    );
    lazy.log.info("Done uninstall: ALL");
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
  debugModelManagement: {
    l10nId: "debug-model-management-group",
    items: [
      {
        id: "onDeviceModel",
        control: "moz-select",
        l10nId: "debug-model-management-feature",
      },
      {
        id: "onDeviceModelInstall",
        control: "moz-button",
        l10nId: "debug-model-management-install",
      },
      {
        id: "onDeviceModelUninstall",
        control: "moz-button",
        l10nId: "debug-model-management-uninstall",
      },
      {
        id: "onDeviceModelUninstallAll",
        control: "moz-button",
        l10nId: "debug-model-management-uninstall-all",
      },
    ],
  },
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
