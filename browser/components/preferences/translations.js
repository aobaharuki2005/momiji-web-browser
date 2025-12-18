/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @ts-check

"use strict";

/* import-globals-from main.js */

/**
 * @import {
 *  TranslationsSettingsElements,
 *  SupportedLanguages,
 *  LanguageInfo
 * } from "./translations"
 */

/** @type {string} */
const ALWAYS_TRANSLATE_LANGS_PREF =
  "browser.translations.alwaysTranslateLanguages";
/** @type {string} */
const NEVER_TRANSLATE_LANGS_PREF =
  "browser.translations.neverTranslateLanguages";
/** @type {string} */
const TOPIC_TRANSLATIONS_PREF_CHANGED = "translations:pref-changed";
/** @type {string} */
const TRANSLATIONS_PERMISSION = "translations";

/** @type {string} */
const ALWAYS_LANGUAGE_ITEM_CLASS = "translations-always-language-item";
/** @type {string} */
const ALWAYS_LANGUAGE_REMOVE_BUTTON_CLASS = "translations-always-remove-button";

/** @type {string} */
const NEVER_LANGUAGE_ITEM_CLASS = "translations-never-language-item";
/** @type {string} */
const NEVER_LANGUAGE_REMOVE_BUTTON_CLASS = "translations-never-remove-button";
/** @type {string} */
const NEVER_SITE_ITEM_CLASS = "translations-never-site-item";
/** @type {string} */
const NEVER_SITE_REMOVE_BUTTON_CLASS = "translations-never-site-remove-button";

const TranslationsSettings = {
  /**
   * True once initialization has completed.
   *
   * @type {boolean}
   */
  initialized: false,

  /**
   * Promise guarding full initialization to avoid re-entry.
   *
   * @type {Promise<void>|null}
   */
  initPromise: null,

  /**
   * Promise cached after the pane/group finish rendering.
   *
   * @type {Promise<void>|null}
   */
  paneRenderPromise: null,

  /**
   * Supported languages fetched from TranslationsParent.
   *
   * @type {SupportedLanguages|null}
   */
  supportedLanguages: null,

  /**
   * Display names for supported languages.
   *
   * @type {Intl.DisplayNames|null}
   */
  languageDisplayNames: null,

  /**
   * Current always-translate language tags.
   *
   * @type {Set<string>}
   */
  alwaysLanguageTags: new Set(),

  /**
   * Current never-translate language tags.
   *
   * @type {Set<string>}
   */
  neverLanguageTags: new Set(),

  /**
   * Current never-translate site origins.
   *
   * @type {Set<string>}
   */
  neverSiteOrigins: new Set(),

  /**
   * Cached DOM elements used by the module.
   *
   * @type {TranslationsSettingsElements|null}
   */
  elements: null,

  /**
   * Handles events this object is registered for.
   *
   * @param {Event} event
   */
  async handleEvent(event) {
    switch (event.type) {
      case "paneshown":
        await this.handlePaneShown(
          /** @type {CustomEvent} */ (event).detail?.category
        );
        break;
      case "change":
        if (event.target === this.elements?.alwaysTranslateLanguagesSelect) {
          await this.onAlwaysLanguageChosen(
            /** @type {HTMLSelectElement} */ (event.target).value
          );
        } else if (
          event.target === this.elements?.neverTranslateLanguagesSelect
        ) {
          await this.onNeverLanguageChosen(
            /** @type {HTMLSelectElement} */ (event.target).value
          );
        }
        break;
      case "click": {
        const target = /** @type {HTMLElement} */ (event.target);
        const alwaysRemoveButton = /** @type {HTMLElement|null} */ (
          target.closest?.(`.${ALWAYS_LANGUAGE_REMOVE_BUTTON_CLASS}`)
        );
        if (alwaysRemoveButton?.dataset.langTag) {
          this.removeAlwaysLanguage(alwaysRemoveButton.dataset.langTag);
          break;
        }

        const neverRemoveButton = /** @type {HTMLElement|null} */ (
          target.closest?.(`.${NEVER_LANGUAGE_REMOVE_BUTTON_CLASS}`)
        );
        if (neverRemoveButton?.dataset.langTag) {
          this.removeNeverLanguage(neverRemoveButton.dataset.langTag);
          break;
        }

        const neverSiteRemoveButton = /** @type {HTMLElement|null} */ (
          target.closest?.(`.${NEVER_SITE_REMOVE_BUTTON_CLASS}`)
        );
        if (neverSiteRemoveButton?.dataset.origin) {
          this.removeNeverSite(neverSiteRemoveButton.dataset.origin);
        }
        break;
      }
      case "unload":
        this.teardown();
        break;
    }
  },

  /**
   * Observer for translations pref changes.
   *
   * @param {any} subject
   * @param {string} topic
   * @param {string} data
   */
  observe(subject, topic, data) {
    if (topic === TOPIC_TRANSLATIONS_PREF_CHANGED) {
      if (data === ALWAYS_TRANSLATE_LANGS_PREF) {
        this.refreshAlwaysLanguages().catch(console.error);
      } else if (data === NEVER_TRANSLATE_LANGS_PREF) {
        this.refreshNeverLanguages().catch(console.error);
      }
    } else if (topic === "perm-changed") {
      this.handlePermissionChange(subject, data);
    }
  },

  /**
   * Runs when the translations sub-pane is shown.
   *
   * @param {string} category
   * @returns {Promise<void>}
   */
  async handlePaneShown(category) {
    if (category !== "paneTranslations") {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      await this.refreshAlwaysLanguages();
      await this.refreshNeverLanguages();
      this.refreshNeverSites();
      return;
    }

    if (this.initialized) {
      await this.refreshAlwaysLanguages();
      await this.refreshNeverLanguages();
      this.refreshNeverSites();
      return;
    }

    this.initPromise = this.init();
    await this.initPromise;
    this.initPromise = null;
  },

  /**
   * Ensure the translations pane has finished rendering.
   *
   * @returns {Promise<void>}
   */
  async ensurePaneRendered() {
    if (this.paneRenderPromise) {
      await this.paneRenderPromise;
      return;
    }

    /**
     * @typedef {HTMLElement & { getUpdateComplete?: () => Promise<void> }} ElementWithUpdateComplete
     */
    const pane = /** @type {ElementWithUpdateComplete|null} */ (
      document.querySelector('setting-pane[data-category="paneTranslations"]')
    );
    const group = /** @type {ElementWithUpdateComplete|null} */ (
      document.querySelector('setting-group[groupid="moreTranslationSettings"]')
    );

    const promises = [];
    if (pane?.getUpdateComplete) {
      promises.push(pane.getUpdateComplete());
    }
    if (group?.getUpdateComplete) {
      promises.push(group.getUpdateComplete());
    }

    if (promises.length) {
      this.paneRenderPromise = (async () => {
        const results = await Promise.allSettled(promises);
        const failure = results.find(result => result.status === "rejected");
        if (failure && failure.reason) {
          console.warn("Translations pane render wait failed", failure.reason);
        }
      })();
      await this.paneRenderPromise;
    }
  },

  /**
   * Initialize the "Always translate languages" and "Never translate languages" sections.
   *
   * @returns {Promise<void>}
   */
  async init() {
    await this.ensurePaneRendered();
    this.cacheElements();
    if (
      !this.elements?.alwaysTranslateLanguagesGroup ||
      !this.elements?.alwaysTranslateLanguagesSelect ||
      !this.elements?.alwaysTranslateLanguagesNoneRow ||
      !this.elements?.neverTranslateLanguagesGroup ||
      !this.elements?.neverTranslateLanguagesSelect ||
      !this.elements?.neverTranslateLanguagesNoneRow ||
      !this.elements?.neverTranslateSitesGroup
    ) {
      return;
    }

    try {
      this.languageDisplayNames =
        TranslationsParent.createLanguageDisplayNames();
      this.supportedLanguages =
        await TranslationsParent.getSupportedLanguages();
    } catch (error) {
      console.error("Failed to initialize translations settings UI", error);
      this.elements.alwaysTranslateLanguagesSelect.disabled = true;
      this.elements.neverTranslateLanguagesSelect.disabled = true;
      return;
    }

    this.elements.alwaysTranslateLanguagesSelect.disabled = false;
    this.elements.neverTranslateLanguagesSelect.disabled = false;
    await this.buildAlwaysSelectOptions();
    await this.buildNeverSelectOptions();

    this.elements.alwaysTranslateLanguagesSelect.addEventListener(
      "change",
      this
    );
    this.elements.alwaysTranslateLanguagesGroup.addEventListener("click", this);
    this.elements.neverTranslateLanguagesSelect.addEventListener(
      "change",
      this
    );
    this.elements.neverTranslateLanguagesGroup.addEventListener("click", this);
    this.elements.neverTranslateSitesGroup.addEventListener("click", this);
    Services.obs.addObserver(this, TOPIC_TRANSLATIONS_PREF_CHANGED);
    Services.obs.addObserver(this, "perm-changed");
    window.addEventListener("unload", this);

    await this.refreshAlwaysLanguages();
    await this.refreshNeverLanguages();
    this.refreshNeverSites();
    this.initialized = true;
  },

  /**
   * Cache the DOM elements we interact with.
   */
  cacheElements() {
    if (this.elements) {
      return;
    }

    const elements = {
      alwaysTranslateLanguagesGroup: /** @type {HTMLElement} */ (
        document.getElementById("translationsAlwaysTranslateLanguagesGroup")
      ),
      alwaysTranslateLanguagesSelect: /** @type {HTMLSelectElement} */ (
        document.getElementById("translationsAlwaysTranslateLanguagesSelect")
      ),
      alwaysTranslateLanguagesNoneRow: /** @type {HTMLElement} */ (
        document.getElementById("translationsAlwaysTranslateLanguagesNoneRow")
      ),
      neverTranslateLanguagesGroup: /** @type {HTMLElement} */ (
        document.getElementById("translationsNeverTranslateLanguagesGroup")
      ),
      neverTranslateLanguagesSelect: /** @type {HTMLSelectElement} */ (
        document.getElementById("translationsNeverTranslateLanguagesSelect")
      ),
      neverTranslateLanguagesNoneRow: /** @type {HTMLElement} */ (
        document.getElementById("translationsNeverTranslateLanguagesNoneRow")
      ),
      neverTranslateSitesGroup: /** @type {HTMLElement} */ (
        document.getElementById("translationsNeverTranslateSitesGroup")
      ),
      neverTranslateSitesRow: /** @type {HTMLElement} */ (
        document.getElementById("translationsNeverTranslateSitesRow")
      ),
      neverTranslateSitesNoneRow: /** @type {HTMLElement} */ (
        document.getElementById("translationsNeverTranslateSitesNoneRow")
      ),
    };

    if (
      !elements.alwaysTranslateLanguagesGroup ||
      !elements.alwaysTranslateLanguagesSelect ||
      !elements.alwaysTranslateLanguagesNoneRow ||
      !elements.neverTranslateLanguagesGroup ||
      !elements.neverTranslateLanguagesSelect ||
      !elements.neverTranslateLanguagesNoneRow
    ) {
      return;
    }

    this.elements = elements;
  },

  /**
   * Handle a selection in the "Always translate languages" dropdown.
   *
   * @param {string} langTag
   */
  async onAlwaysLanguageChosen(langTag) {
    if (!langTag) {
      return;
    }

    TranslationsParent.addLangTagToPref(langTag, ALWAYS_TRANSLATE_LANGS_PREF);
    TranslationsParent.removeLangTagFromPref(
      langTag,
      NEVER_TRANSLATE_LANGS_PREF
    );
    await this.resetAlwaysSelect();
  },

  /**
   * Remove the given language from the always translate list.
   *
   * @param {string} langTag
   */
  removeAlwaysLanguage(langTag) {
    TranslationsParent.removeLangTagFromPref(
      langTag,
      ALWAYS_TRANSLATE_LANGS_PREF
    );
  },

  async resetSelect(select, settingId) {
    const setting = Preferences.getSetting?.(settingId);
    if (setting) {
      setting.value = "";
    }

    if (!select) {
      return;
    }

    if (select.updateComplete) {
      await select.updateComplete;
    }

    select.value = "";
    if (select.inputEl) {
      select.inputEl.value = "";
    }

    if (select.updateComplete) {
      await select.updateComplete;
    }
  },

  /**
   * Reset the dropdown back to the placeholder value and underlying setting state.
   */
  async resetAlwaysSelect() {
    await this.resetSelect(
      this.elements?.alwaysTranslateLanguagesSelect,
      "translationsAlwaysTranslateLanguagesSelect"
    );
  },

  /**
   * Refresh the rendered list of always-translate languages to match prefs.
   */
  async refreshAlwaysLanguages() {
    if (!this.elements?.alwaysTranslateLanguagesGroup) {
      return;
    }

    const langTags = Array.from(
      TranslationsParent.getAlwaysTranslateLanguages?.() ?? []
    );

    if (this.alwaysLanguageTags) {
      for (const langTag of langTags) {
        if (this.alwaysLanguageTags.has(langTag)) {
          continue;
        }
        TranslationsParent.removeLangTagFromPref(
          langTag,
          NEVER_TRANSLATE_LANGS_PREF
        );
      }
    }

    this.alwaysLanguageTags = new Set(langTags);

    this.renderAlwaysLanguages(langTags);
    await this.updateAlwaysSelectOptionState();
  },

  /**
   * Render the current set of always-translate languages into the list UI.
   *
   * @param {string[]} langTags
   */
  renderAlwaysLanguages(langTags) {
    const { alwaysTranslateLanguagesGroup, alwaysTranslateLanguagesNoneRow } =
      this.elements;

    for (const item of alwaysTranslateLanguagesGroup.querySelectorAll(
      `.${ALWAYS_LANGUAGE_ITEM_CLASS}`
    )) {
      item.remove();
    }

    if (alwaysTranslateLanguagesNoneRow) {
      const hasLanguages = !!langTags.length;
      alwaysTranslateLanguagesNoneRow.hidden = hasLanguages;

      if (hasLanguages && alwaysTranslateLanguagesNoneRow.isConnected) {
        alwaysTranslateLanguagesNoneRow.remove();
      } else if (
        !hasLanguages &&
        !alwaysTranslateLanguagesNoneRow.isConnected
      ) {
        alwaysTranslateLanguagesGroup.appendChild(
          alwaysTranslateLanguagesNoneRow
        );
      }
    }

    const sortedLangTags = [...langTags].sort((langTagA, langTagB) => {
      const labelA = this.formatLanguageLabel(langTagA) ?? langTagA;
      const labelB = this.formatLanguageLabel(langTagB) ?? langTagB;
      return labelA.localeCompare(labelB);
    });

    for (const langTag of sortedLangTags) {
      const label = this.formatLanguageLabel(langTag);
      if (!label) {
        continue;
      }

      const removeButton = document.createElement("moz-button");
      removeButton.setAttribute("slot", "actions-start");
      removeButton.setAttribute("type", "icon ghost");
      removeButton.setAttribute(
        "iconsrc",
        "chrome://global/skin/icons/delete.svg"
      );
      removeButton.classList.add(ALWAYS_LANGUAGE_REMOVE_BUTTON_CLASS);
      removeButton.dataset.langTag = langTag;
      removeButton.setAttribute("aria-label", label);

      const item = document.createElement("moz-box-item");
      item.classList.add(ALWAYS_LANGUAGE_ITEM_CLASS);
      item.setAttribute("label", label);
      item.dataset.langTag = langTag;
      item.appendChild(removeButton);
      if (
        alwaysTranslateLanguagesNoneRow &&
        alwaysTranslateLanguagesNoneRow.parentElement ===
          alwaysTranslateLanguagesGroup
      ) {
        alwaysTranslateLanguagesGroup.insertBefore(
          item,
          alwaysTranslateLanguagesNoneRow
        );
      } else {
        alwaysTranslateLanguagesGroup.appendChild(item);
      }
    }
  },

  /**
   * Format a language tag for display using the cached display names.
   *
   * @param {string} langTag
   * @returns {string|null}
   */
  formatLanguageLabel(langTag) {
    try {
      return this.languageDisplayNames?.of(langTag) ?? null;
    } catch (error) {
      console.warn(`Failed to format language label for ${langTag}`, error);
      return null;
    }
  },

  /**
   * Populate the select options for the supported source languages.
   */
  async buildAlwaysSelectOptions() {
    const select = this.elements?.alwaysTranslateLanguagesSelect;
    if (!select || !this.supportedLanguages?.sourceLanguages?.length) {
      return;
    }

    const placeholder = select.querySelector('moz-option[value=""]');
    for (const option of select.querySelectorAll("moz-option")) {
      if (option !== placeholder) {
        option.remove();
      }
    }

    const sourceLanguages = [...this.supportedLanguages.sourceLanguages].sort(
      (a, b) => a.displayName.localeCompare(b.displayName)
    );
    for (const { langTag, displayName } of sourceLanguages) {
      const option = document.createElement("moz-option");
      option.setAttribute("value", langTag);
      option.setAttribute("label", displayName);
      select.appendChild(option);
    }

    await this.resetAlwaysSelect();
  },

  /**
   * Disable already-added languages in the select so they cannot be re-added.
   */
  async updateAlwaysSelectOptionState() {
    const select = this.elements?.alwaysTranslateLanguagesSelect;
    if (!select) {
      return;
    }

    for (const option of select.querySelectorAll("moz-option")) {
      const value = option.getAttribute("value");
      if (!value) {
        continue;
      }
      option.disabled = this.alwaysLanguageTags.has(value);
    }

    await this.resetAlwaysSelect();
  },

  /**
   * Handle a selection in the "Never translate languages" dropdown.
   *
   * @param {string} langTag
   */
  async onNeverLanguageChosen(langTag) {
    if (!langTag) {
      return;
    }

    TranslationsParent.addLangTagToPref(langTag, NEVER_TRANSLATE_LANGS_PREF);
    TranslationsParent.removeLangTagFromPref(
      langTag,
      ALWAYS_TRANSLATE_LANGS_PREF
    );
    await this.resetNeverSelect();
  },

  /**
   * Remove the given language from the never translate list.
   *
   * @param {string} langTag
   */
  removeNeverLanguage(langTag) {
    TranslationsParent.removeLangTagFromPref(
      langTag,
      NEVER_TRANSLATE_LANGS_PREF
    );
  },

  /**
   * Reset the dropdown back to the placeholder value and underlying setting state.
   */
  async resetNeverSelect() {
    await this.resetSelect(
      this.elements?.neverTranslateLanguagesSelect,
      "translationsNeverTranslateLanguagesSelect"
    );
  },

  /**
   * Refresh the rendered list of never-translate languages to match prefs.
   */
  async refreshNeverLanguages() {
    if (!this.elements?.neverTranslateLanguagesGroup) {
      return;
    }

    const langTags = Array.from(
      TranslationsParent.getNeverTranslateLanguages?.() ?? []
    );
    this.neverLanguageTags = new Set(langTags);

    this.renderNeverLanguages(langTags);
    await this.updateNeverSelectOptionState();
  },

  /**
   * Render the current set of never-translate languages into the list UI.
   *
   * @param {string[]} langTags
   */
  renderNeverLanguages(langTags) {
    const { neverTranslateLanguagesGroup, neverTranslateLanguagesNoneRow } =
      this.elements;

    for (const item of neverTranslateLanguagesGroup.querySelectorAll(
      `.${NEVER_LANGUAGE_ITEM_CLASS}`
    )) {
      item.remove();
    }

    if (neverTranslateLanguagesNoneRow) {
      const hasLanguages = Boolean(langTags.length);
      neverTranslateLanguagesNoneRow.hidden = hasLanguages;

      if (hasLanguages && neverTranslateLanguagesNoneRow.isConnected) {
        neverTranslateLanguagesNoneRow.remove();
      } else if (!hasLanguages && !neverTranslateLanguagesNoneRow.isConnected) {
        neverTranslateLanguagesGroup.appendChild(
          neverTranslateLanguagesNoneRow
        );
      }
    }

    const sortedLangTags = [...langTags].sort((langTagA, langTagB) => {
      const labelA = this.formatLanguageLabel(langTagA) ?? langTagA;
      const labelB = this.formatLanguageLabel(langTagB) ?? langTagB;
      return labelA.localeCompare(labelB);
    });

    for (const langTag of sortedLangTags) {
      const label = this.formatLanguageLabel(langTag);
      if (!label) {
        continue;
      }

      const removeButton = document.createElement("moz-button");
      removeButton.setAttribute("slot", "actions-start");
      removeButton.setAttribute("type", "icon ghost");
      removeButton.setAttribute(
        "iconsrc",
        "chrome://global/skin/icons/delete.svg"
      );
      removeButton.classList.add(NEVER_LANGUAGE_REMOVE_BUTTON_CLASS);
      removeButton.dataset.langTag = langTag;
      removeButton.setAttribute("aria-label", label);

      const item = document.createElement("moz-box-item");
      item.classList.add(NEVER_LANGUAGE_ITEM_CLASS);
      item.setAttribute("label", label);
      item.dataset.langTag = langTag;
      item.appendChild(removeButton);
      if (
        neverTranslateLanguagesNoneRow &&
        neverTranslateLanguagesNoneRow.parentElement ===
          neverTranslateLanguagesGroup
      ) {
        neverTranslateLanguagesGroup.insertBefore(
          item,
          neverTranslateLanguagesNoneRow
        );
      } else {
        neverTranslateLanguagesGroup.appendChild(item);
      }
    }
  },

  /**
   * Populate the select options for the supported source languages.
   */
  async buildNeverSelectOptions() {
    const select = this.elements?.neverTranslateLanguagesSelect;
    if (!select || !this.supportedLanguages?.sourceLanguages?.length) {
      return;
    }

    const placeholder = select.querySelector('moz-option[value=""]');
    for (const option of select.querySelectorAll("moz-option")) {
      if (option !== placeholder) {
        option.remove();
      }
    }

    const sourceLanguages = [...this.supportedLanguages.sourceLanguages].sort(
      (a, b) => a.displayName.localeCompare(b.displayName)
    );
    for (const { langTag, displayName } of sourceLanguages) {
      const option = document.createElement("moz-option");
      option.setAttribute("value", langTag);
      option.setAttribute("label", displayName);
      select.appendChild(option);
    }

    await this.resetNeverSelect();
  },

  /**
   * Disable already-added languages in the select so they cannot be re-added.
   */
  async updateNeverSelectOptionState() {
    const select = this.elements?.neverTranslateLanguagesSelect;
    if (!select) {
      return;
    }

    for (const option of select.querySelectorAll("moz-option")) {
      const value = option.getAttribute("value");
      if (!value) {
        continue;
      }
      option.disabled = this.neverLanguageTags.has(value);
    }

    await this.resetNeverSelect();
  },

  /**
   * Refresh the rendered list of never-translate sites.
   */
  refreshNeverSites() {
    if (!this.elements?.neverTranslateSitesGroup) {
      return;
    }

    /** @type {string[]} */
    let siteOrigins = [];
    try {
      siteOrigins = TranslationsParent.listNeverTranslateSites() ?? [];
    } catch (error) {
      console.error("Failed to list never translate sites", error);
    }

    this.neverSiteOrigins = new Set(siteOrigins);
    this.renderNeverSites(siteOrigins);
  },

  /**
   * Render the never-translate sites list.
   *
   * @param {string[]} siteOrigins
   */
  renderNeverSites(siteOrigins) {
    const { neverTranslateSitesGroup, neverTranslateSitesNoneRow } =
      this.elements ?? {};
    if (!neverTranslateSitesGroup) {
      return;
    }

    for (const item of neverTranslateSitesGroup.querySelectorAll(
      `.${NEVER_SITE_ITEM_CLASS}`
    )) {
      item.remove();
    }

    if (neverTranslateSitesNoneRow) {
      const hasSites = Boolean(siteOrigins.length);
      neverTranslateSitesNoneRow.hidden = hasSites;

      if (hasSites && neverTranslateSitesNoneRow.isConnected) {
        neverTranslateSitesNoneRow.remove();
      } else if (!hasSites && !neverTranslateSitesNoneRow.isConnected) {
        neverTranslateSitesGroup.appendChild(neverTranslateSitesNoneRow);
      }
    }

    const sortedOrigins = [...siteOrigins].sort((originA, originB) => {
      return this.getSiteSortKey(originA).localeCompare(
        this.getSiteSortKey(originB)
      );
    });

    for (const origin of sortedOrigins) {
      const removeButton = document.createElement("moz-button");
      removeButton.setAttribute("slot", "actions-start");
      removeButton.setAttribute("type", "icon ghost");
      removeButton.setAttribute(
        "iconsrc",
        "chrome://global/skin/icons/delete.svg"
      );
      removeButton.classList.add(NEVER_SITE_REMOVE_BUTTON_CLASS);
      removeButton.dataset.origin = origin;
      removeButton.setAttribute("aria-label", origin);

      const item = document.createElement("moz-box-item");
      item.classList.add(NEVER_SITE_ITEM_CLASS);
      item.setAttribute("label", origin);
      item.dataset.origin = origin;
      item.appendChild(removeButton);
      if (
        neverTranslateSitesNoneRow &&
        neverTranslateSitesNoneRow.parentElement === neverTranslateSitesGroup
      ) {
        neverTranslateSitesGroup.insertBefore(item, neverTranslateSitesNoneRow);
      } else {
        neverTranslateSitesGroup.appendChild(item);
      }
    }
  },

  /**
   * Remove a site from the never-translate list.
   *
   * @param {string} origin
   */
  removeNeverSite(origin) {
    if (!origin || !this.neverSiteOrigins.has(origin)) {
      return;
    }

    try {
      TranslationsParent.setNeverTranslateSiteByOrigin(false, origin);
    } catch (error) {
      console.error("Failed to remove never translate site", error);
      return;
    }

    this.refreshNeverSites();
  },

  /**
   * Create a sort key that ignores protocol differences.
   *
   * @param {string} origin
   * @returns {string}
   */
  getSiteSortKey(origin) {
    try {
      return Services.io.newURI(origin).asciiHostPort;
    } catch {
      return origin;
    }
  },

  /**
   * Handle updates to translations permissions.
   *
   * @param {nsISupports} subject
   * @param {string} data
   */
  handlePermissionChange(subject, data) {
    if (data === "cleared") {
      this.neverSiteOrigins = new Set();
      this.renderNeverSites([]);
      return;
    }

    const perm = subject?.QueryInterface?.(Ci.nsIPermission);
    if (perm?.type !== TRANSLATIONS_PERMISSION) {
      return;
    }

    this.refreshNeverSites();
  },

  /**
   * Remove observers and listeners added during init.
   */
  teardown() {
    try {
      Services.obs.removeObserver(this, TOPIC_TRANSLATIONS_PREF_CHANGED);
      Services.obs.removeObserver(this, "perm-changed");
    } catch (e) {
      // Ignore if we were never added.
    }
    document.removeEventListener("paneshown", this);
    window.removeEventListener("unload", this);
    this.elements?.alwaysTranslateLanguagesSelect?.removeEventListener(
      "change",
      this
    );
    this.elements?.alwaysTranslateLanguagesGroup?.removeEventListener(
      "click",
      this
    );
    this.elements?.neverTranslateLanguagesSelect?.removeEventListener(
      "change",
      this
    );
    this.elements?.neverTranslateLanguagesGroup?.removeEventListener(
      "click",
      this
    );
    this.elements?.neverTranslateSitesGroup?.removeEventListener("click", this);
  },
};

document.addEventListener("paneshown", TranslationsSettings);
