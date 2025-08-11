/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import {
 *   RefinedSearchConfig,
 *   SearchEngineDefinition
 * } from "../uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs";
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
  SearchDeviceType:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs",
  SearchEngineSelector:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs",
  SearchUserEnvironment:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs",
  SearchApplicationName:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs",
  SearchUpdateChannel:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustSearch.sys.mjs",
  SearchUtils: "moz-src:///toolkit/components/search/SearchUtils.sys.mjs",
  logConsole: () =>
    console.createInstance({
      prefix: "SearchEngineSelector",
      maxLogLevel: lazy.SearchUtils.loggingEnabled ? "Debug" : "Warn",
    }),
});

/**
 * SearchEngineSelector parses the JSON configuration for
 * search engines and returns the applicable engines depending
 * on their region + locale.
 */
export class SearchEngineSelector {
  /**
   * @param {Function} listener
   *   A listener for configuration update changes.
   */
  constructor(listener) {
    this._remoteConfig = lazy.RemoteSettings(lazy.SearchUtils.SETTINGS_KEY);
    this._remoteConfigOverrides = lazy.RemoteSettings(
      lazy.SearchUtils.SETTINGS_OVERRIDES_KEY
    );
    this._listenerAdded = false;
    this._onConfigurationUpdated = this._onConfigurationUpdated.bind(this);
    this._onConfigurationOverridesUpdated =
      this._onConfigurationOverridesUpdated.bind(this);
    this._changeListener = listener;
  }

  /**
   * Resets the remote settings listeners.
   */
  reset() {
    if (this._listenerAdded) {
      this._remoteConfig.off("sync", this._onConfigurationUpdated);
      this._remoteConfigOverrides.off(
        "sync",
        this._onConfigurationOverridesUpdated
      );
      this._listenerAdded = false;
    }
  }

  /**
   * Handles getting the configuration from remote settings.
   *
   * @returns {Promise<object>}
   *   The configuration data.
   */
  async getEngineConfiguration() {
    if (this._getConfigurationPromise) {
      return this._getConfigurationPromise;
    }

    this._getConfigurationPromise = Promise.all([
      this._getConfiguration(),
      this.#getConfigurationOverrides(),
    ]);
    let remoteSettingsData = await this._getConfigurationPromise;
    this._configuration = remoteSettingsData[0];
    delete this._getConfigurationPromise;

    if (!this._configuration?.length) {
      throw Components.Exception(
        "Failed to get engine data from Remote Settings",
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    if (!this._listenerAdded) {
      this._remoteConfig.on("sync", this._onConfigurationUpdated);
      this._remoteConfigOverrides.on(
        "sync",
        this._onConfigurationOverridesUpdated
      );
      this._listenerAdded = true;
    }

    this.#selector.setSearchConfig(
      JSON.stringify({ data: this._configuration })
    );
    this.#selector.setConfigOverrides(
      JSON.stringify({ data: remoteSettingsData[1] })
    );

    return this._configuration;
  }

  /**
   * Finds an engine configuration that has a matching host.
   *
   * @param {string} host
   *   The host to match.
   *
   * @returns {Promise<?SearchEngineDefinition>}
   *   The configuration data for an engine.
   */
  async findContextualSearchEngineByHost(host) {
    for (let config of this._configuration) {
      if (config.recordType !== "engine") {
        continue;
      }
      let searchHost = new URL(config.base.urls.search.base).hostname;
      if (searchHost.startsWith("www.")) {
        searchHost = searchHost.slice(4);
      }
      if (searchHost.startsWith(host)) {
        let engine = structuredClone(config.base);
        engine.identifier = config.identifier;
        return engine;
      }
    }
    return null;
  }

  /**
   * Finds an engine configuration that has a matching identifier.
   *
   * @param {string} id
   *   The identifier to match.
   *
   * @returns {Promise<?SearchEngineDefinition>}
   *   The configuration data for an engine.
   */
  async findContextualSearchEngineById(id) {
    for (let config of this._configuration) {
      if (config.recordType !== "engine") {
        continue;
      }
      if (config.identifier == id) {
        let engine = structuredClone(config.base);
        engine.identifier = config.identifier;
        return engine;
      }
    }
    return null;
  }

  /**
   * Obtains the configuration from remote settings. This includes
   * verifying the signature of the record within the database.
   *
   * If the signature in the database is invalid, the database will be wiped
   * and the stored dump will be used, until the settings next update.
   *
   * Note that this may cause a network check of the certificate, but that
   * should generally be quick.
   *
   * @param {boolean} [firstTime]
   *   Internal boolean to indicate if this is the first time check or not.
   * @returns {Promise<object[]>}
   *   An array of objects in the database, or an empty array if none
   *   could be obtained.
   */
  async _getConfiguration(firstTime = true) {
    let result = [];
    let failed = false;
    try {
      result = await this._remoteConfig.get({
        order: "id",
      });
    } catch (ex) {
      lazy.logConsole.error(ex);
      failed = true;
    }
    if (!result.length) {
      lazy.logConsole.error("Received empty search configuration!");
      failed = true;
    }
    // If we failed, or the result is empty, try loading from the local dump.
    if (firstTime && failed) {
      await this._remoteConfig.db.clear();
      // Now call this again.
      return this._getConfiguration(false);
    }
    return result;
  }

  /**
   * Handles updating of the configuration. Note that the search service is
   * only updated after a period where the user is observed to be idle.
   *
   * @param {object} options
   *   The options object
   * @param {object} options.data
   *   The data to update
   * @param {Array} options.data.current
   *   The new configuration object
   */
  _onConfigurationUpdated({ data: { current } }) {
    this._configuration = current;

    this.#selector.setSearchConfig(
      JSON.stringify({ data: this._configuration })
    );

    lazy.logConsole.debug("Search configuration updated remotely");
    if (this._changeListener) {
      this._changeListener();
    }
  }

  /**
   * Handles updating of the configuration. Note that the search service is
   * only updated after a period where the user is observed to be idle.
   *
   * @param {object} options
   *   The options object
   * @param {object} options.data
   *   The data to update
   * @param {Array} options.data.current
   *   The new configuration object
   */
  _onConfigurationOverridesUpdated({ data: { current } }) {
    this.#selector.setConfigOverrides(JSON.stringify({ data: current }));

    lazy.logConsole.debug("Search configuration overrides updated remotely");
    if (this._changeListener) {
      this._changeListener();
    }
  }

  /**
   * Obtains the configuration overrides from remote settings.
   *
   * @returns {Promise<object[]>}
   *   An array of objects in the database, or an empty array if none
   *   could be obtained.
   */
  async #getConfigurationOverrides() {
    let result = [];
    try {
      result = await this._remoteConfigOverrides.get();
    } catch (ex) {
      // This data is remote only, so we just return an empty array if it fails.
    }
    return result;
  }

  /**
   * @param {object} options
   *   The options object
   * @param {string} options.locale
   *   Users locale.
   * @param {string} options.region
   *   Users region.
   * @param {string} [options.channel]
   *   The update channel the application is running on.
   * @param {string} [options.distroID]
   *   The distribution ID of the application.
   * @param {string} [options.experiment]
   *   Any associated experiment id.
   * @param {string} [options.appName]
   *   The name of the application.
   * @param {string} [options.version]
   *   The version of the application.
   * @returns {Promise<RefinedSearchConfig>}
   *   An object which contains the refined configuration with a filtered list
   *   of search engines, and the identifiers for the application default engines.
   */
  async fetchEngineConfiguration({
    locale,
    region,
    channel = "default",
    distroID,
    experiment,
    appName = Services.appinfo.name ?? "",
    version = Services.appinfo.version ?? "",
  }) {
    if (!this._configuration) {
      await this.getEngineConfiguration();
    }

    lazy.logConsole.debug(
      `fetchEngineConfiguration ${locale}:${region}:${channel}:${distroID}:${experiment}:${appName}:${version}`
    );

    let refinedSearchConfig = this.#selector.filterEngineConfiguration(
      new lazy.SearchUserEnvironment({
        locale,
        region,
        updateChannel: this.#convertUpdateChannel(channel),
        distributionId: distroID ?? "",
        experiment: experiment ?? "",
        appName: this.#convertApplicationName(appName),
        version,
        deviceType: lazy.SearchDeviceType.NONE,
      })
    );

    refinedSearchConfig.engines = refinedSearchConfig.engines.filter(
      e => !e.optional
    );

    if (
      !refinedSearchConfig.appDefaultEngineId ||
      !refinedSearchConfig.engines.find(
        e => e.identifier == refinedSearchConfig.appDefaultEngineId
      )
    ) {
      if (refinedSearchConfig.engines.length) {
        lazy.logConsole.error(
          "Could not find a matching default engine, using the first one in the list"
        );
        refinedSearchConfig.appDefaultEngineId =
          refinedSearchConfig.engines[0].identifier;
      } else {
        throw new Error(
          "Could not find any engines in the filtered configuration"
        );
      }
    }
    if (lazy.SearchUtils.loggingEnabled) {
      lazy.logConsole.debug(
        "fetchEngineConfiguration: " +
          refinedSearchConfig.engines.map(e => e.identifier)
      );
    }

    return refinedSearchConfig;
  }

  /**
   * @type {InstanceType<typeof lazy.SearchEngineSelector>?}
   */
  #cachedSelector = null;

  /**
   * Returns the Rust based selector.
   *
   * @returns {InstanceType<typeof lazy.SearchEngineSelector>}
   */
  get #selector() {
    if (!this.#cachedSelector) {
      this.#cachedSelector = lazy.SearchEngineSelector.init();
    }
    return this.#cachedSelector;
  }

  /**
   * Converts the update channel from a string into a type the search engine
   * selector can understand.
   *
   * @param {string} channel
   *   The channel name to convert.
   * @returns {Values<typeof lazy.SearchUpdateChannel>}
   */
  #convertUpdateChannel(channel) {
    let uppercaseChannel = channel.toUpperCase();

    if (uppercaseChannel in lazy.SearchUpdateChannel) {
      return lazy.SearchUpdateChannel[uppercaseChannel];
    }

    return lazy.SearchUpdateChannel.DEFAULT;
  }

  /**
   * Converts the application name from a string into a type the search engine
   * selector can understand.
   *
   * @param {string} appName
   *   The application name to convert.
   * @returns {Values<typeof lazy.SearchApplicationName>}
   */
  #convertApplicationName(appName) {
    let uppercaseAppName = appName.toUpperCase().replace("-", "_");

    if (uppercaseAppName in lazy.SearchApplicationName) {
      return lazy.SearchApplicationName[uppercaseAppName];
    }
    return lazy.SearchApplicationName.FIREFOX;
  }
}
