/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module exports a urlbar result class, each representing a single result
 * found by a provider that can be passed from the model to the view through
 * the controller. It is mainly defined by a result type, and a payload,
 * containing the data. A few getters allow to retrieve information common to all
 * the result types.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  JsonSchemaValidator:
    "resource://gre/modules/components-utils/JsonSchemaValidator.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

/**
 * @typedef UrlbarAutofillData
 * @property {string} value
 *   The value to insert for autofill.
 * @property {number} selectionStart
 *   Where to start the selection for the autofill.
 * @property {number} selectionEnd
 *   Where to end the selection for the autofill.
 * @property {string} [type]
 *   The type of the autofill.
 * @property {string} [adaptiveHistoryInput]
 *   The input string associated with this autofill item.
 */

/**
 * Class used to create a single result.
 */
export class UrlbarResult {
  /**
   * @typedef {object} Payload
   * @property {string} [qsSuggestion]
   *   The suggestion text from quick suggest.
   */

  /**
   * @param {object} params
   * @param {Values<typeof lazy.UrlbarUtils.RESULT_TYPE>} params.type
   * @param {Values<typeof lazy.UrlbarUtils.RESULT_SOURCE>} params.source
   * @param {UrlbarAutofillData} [params.autofill]
   * @param {number} [params.exposureTelemetry]
   * @param {Values<typeof lazy.UrlbarUtils.RESULT_GROUP>} [params.group]
   * @param {boolean} [params.heuristic]
   * @param {boolean} [params.hideRowLabel]
   * @param {boolean} [params.isBestMatch]
   * @param {boolean} [params.isRichSuggestion]
   * @param {boolean} [params.isSuggestedIndexRelativeToGroup]
   * @param {string} [params.providerName]
   * @param {number} [params.resultSpan]
   * @param {number} [params.richSuggestionIconSize]
   * @param {string} [params.richSuggestionIconVariation]
   * @param {string} [params.rowLabel]
   * @param {boolean} [params.showFeedbackMenu]
   * @param {number} [params.suggestedIndex]
   * @param {Payload} [params.payload]
   * @param {object} [params.payloadHighlights]
   * @param {boolean} [params.testForceNewContent] Used for test only.
   */
  constructor({
    type,
    source,
    autofill,
    exposureTelemetry = lazy.UrlbarUtils.EXPOSURE_TELEMETRY.NONE,
    group,
    heuristic = false,
    hideRowLabel = false,
    isBestMatch = false,
    isRichSuggestion = false,
    isSuggestedIndexRelativeToGroup = false,
    providerName,
    resultSpan,
    richSuggestionIconSize,
    richSuggestionIconVariation,
    rowLabel,
    showFeedbackMenu = false,
    suggestedIndex,
    payload,
    payloadHighlights = {},
    testForceNewContent,
  }) {
    // Type describes the payload and visualization that should be used for
    // this result.
    if (!Object.values(lazy.UrlbarUtils.RESULT_TYPE).includes(type)) {
      throw new Error("Invalid result type");
    }
    this.#type = type;

    // Source describes which data has been used to derive this result. In case
    // multiple sources are involved, use the more privacy restricted.
    if (!Object.values(lazy.UrlbarUtils.RESULT_SOURCE).includes(source)) {
      throw new Error("Invalid result source");
    }
    this.#source = source;

    // The payload contains result data. Some of the data is common across
    // multiple types, but most of it will vary.
    if (!payload || typeof payload != "object") {
      throw new Error("Invalid result payload");
    }
    this.#payload = this.#validatePayload(payload);

    if (!payloadHighlights || typeof payloadHighlights != "object") {
      throw new Error("Invalid result payload highlights");
    }
    this.#payloadHighlights = Object.freeze(payloadHighlights);

    this.#autofill = autofill;
    this.#exposureTelemetry = exposureTelemetry;
    this.#group = group;
    this.#heuristic = heuristic;
    this.#hideRowLabel = hideRowLabel;
    this.#isBestMatch = isBestMatch;
    this.#isRichSuggestion = isRichSuggestion;
    this.#isSuggestedIndexRelativeToGroup = isSuggestedIndexRelativeToGroup;
    this.#richSuggestionIconSize = richSuggestionIconSize;
    this.#richSuggestionIconVariation = richSuggestionIconVariation;
    this.#providerName = providerName;
    this.#resultSpan = resultSpan;
    this.#rowLabel = rowLabel;
    this.#showFeedbackMenu = showFeedbackMenu;
    this.#suggestedIndex = suggestedIndex;

    if (this.#type == lazy.UrlbarUtils.RESULT_TYPE.TIP) {
      this.#isRichSuggestion = true;
      this.#richSuggestionIconSize = 24;
    }

    this.#testForceNewContent = testForceNewContent;
  }

  /**
   * @type {number}
   *   The index of the row where this result is in the suggestions. This is
   *   updated by UrlbarView when new result sets are displayed.
   */
  rowIndex = undefined;

  get type() {
    return this.#type;
  }

  get source() {
    return this.#source;
  }

  get autofill() {
    return this.#autofill;
  }

  get exposureTelemetry() {
    return this.#exposureTelemetry;
  }
  set exposureTelemetry(value) {
    this.#exposureTelemetry = value;
  }

  get group() {
    return this.#group;
  }

  get heuristic() {
    return this.#heuristic;
  }

  get hideRowLabel() {
    return this.#hideRowLabel;
  }

  get isBestMatch() {
    return this.#isBestMatch;
  }

  get isRichSuggestion() {
    return this.#isRichSuggestion;
  }
  set isRichSuggestion(value) {
    this.#isRichSuggestion = value;
  }

  get isSuggestedIndexRelativeToGroup() {
    return this.#isSuggestedIndexRelativeToGroup;
  }
  set isSuggestedIndexRelativeToGroup(value) {
    this.#isSuggestedIndexRelativeToGroup = value;
  }

  get providerName() {
    return this.#providerName;
  }
  set providerName(value) {
    this.#providerName = value;
  }

  /**
   * The type of the UrlbarProvider providing the result.
   *
   * @type {?Values<typeof lazy.UrlbarUtils.PROVIDER_TYPE>}
   */
  get providerType() {
    return this.#providerType;
  }
  set providerType(value) {
    this.#providerType = value;
  }

  get resultSpan() {
    return this.#resultSpan;
  }

  get richSuggestionIconSize() {
    return this.#richSuggestionIconSize;
  }

  get richSuggestionIconVariation() {
    return this.#richSuggestionIconVariation;
  }
  set richSuggestionIconSize(value) {
    this.#richSuggestionIconSize = value;
  }

  get rowLabel() {
    return this.#rowLabel;
  }

  get showFeedbackMenu() {
    return this.#showFeedbackMenu;
  }

  get suggestedIndex() {
    return this.#suggestedIndex;
  }
  set suggestedIndex(value) {
    this.#suggestedIndex = value;
  }

  get payload() {
    return this.#payload;
  }

  get payloadHighlights() {
    return this.#payloadHighlights;
  }

  get testForceNewContent() {
    return this.#testForceNewContent;
  }

  /**
   * Returns a title that could be used as a label for this result.
   *
   * @returns {string} The label to show in a simplified title / url view.
   */
  get title() {
    let value = this.#getTitleOrHighlights(this.payload);
    return !value || Array.isArray(value) ? "" : value;
  }

  /**
   * Returns an array of highlights for the title.
   *
   * @returns {Array} The array of highlights.
   */
  get titleHighlights() {
    let value = this.#getTitleOrHighlights(this.payloadHighlights);
    return Array.isArray(value) ? value : [];
  }

  /**
   * Returns an icon url.
   *
   * @returns {string} url of the icon.
   */
  get icon() {
    return this.payload.icon;
  }

  /**
   * Returns whether the result's `suggestedIndex` property is defined.
   * `suggestedIndex` is an optional hint to the muxer that can be set to
   * suggest a specific position among the results.
   *
   * @returns {boolean} Whether `suggestedIndex` is defined.
   */
  get hasSuggestedIndex() {
    return typeof this.suggestedIndex == "number";
  }

  /**
   * Convenience getter that returns whether the result's exposure telemetry
   * indicates it should be hidden.
   *
   * @returns {boolean}
   *   Whether the result should be hidden.
   */
  get isHiddenExposure() {
    return this.exposureTelemetry == lazy.UrlbarUtils.EXPOSURE_TELEMETRY.HIDDEN;
  }

  /**
   * Returns title or highlights of given payload or payloadHighlights.
   *
   * @param {object} target payload or payloadHighlights
   * @returns {string|Array} The title or array of highlights.
   */
  #getTitleOrHighlights(target) {
    switch (this.type) {
      case lazy.UrlbarUtils.RESULT_TYPE.KEYWORD:
      case lazy.UrlbarUtils.RESULT_TYPE.TAB_SWITCH:
      case lazy.UrlbarUtils.RESULT_TYPE.URL:
      case lazy.UrlbarUtils.RESULT_TYPE.OMNIBOX:
      case lazy.UrlbarUtils.RESULT_TYPE.REMOTE_TAB:
        if (this.payload.qsSuggestion) {
          if (this.payload == target) {
            // We will initially only be targeting en-US users with this
            // experiment but will need to change this to work properly with
            // l10n.
            return target.qsSuggestion + " — " + target.title;
          }
          return target.qsSuggestion;
        }
        if (this.payload.fallbackTitle) {
          return target.fallbackTitle;
        }
        if (this.payload.title) {
          return target.title;
        }
        return target.url;
      case lazy.UrlbarUtils.RESULT_TYPE.SEARCH:
        if (this.payload.title) {
          return target.title;
        }
        if (this.payload.providesSearchMode) {
          return null;
        }
        if (this.payload.tail && this.payload.tailOffsetIndex >= 0) {
          return target.tail;
        } else if (this.payload.suggestion) {
          return target.suggestion;
        }
        return target.query;
    }
    return null;
  }

  /**
   * Returns the given payload if it's valid or throws an error if it's not.
   * The schemas in UrlbarUtils.RESULT_PAYLOAD_SCHEMA are used for validation.
   *
   * @param {object} payload The payload object.
   * @returns {object} `payload` if it's valid.
   */
  #validatePayload(payload) {
    let schema = lazy.UrlbarUtils.getPayloadSchema(this.type);
    if (!schema) {
      throw new Error(`Unrecognized result type: ${this.type}`);
    }
    let result = lazy.JsonSchemaValidator.validate(payload, schema, {
      allowExplicitUndefinedProperties: true,
      allowNullAsUndefinedProperties: true,
      allowAdditionalProperties:
        this.type == lazy.UrlbarUtils.RESULT_TYPE.DYNAMIC,
    });
    if (!result.valid) {
      throw result.error;
    }
    return payload;
  }

  /**
   * A convenience function that takes a payload annotated with
   * UrlbarUtils.HIGHLIGHT enums and returns the payload and the payload's
   * highlights. Use this function when the highlighting required by your
   * payload is based on simple substring matching, as done by
   * UrlbarUtils.getTokenMatches(). Pass the return values as the `payload` and
   * `payloadHighlights` params of the UrlbarResult constructor.
   * `payloadHighlights` is optional. If omitted, payload will not be
   * highlighted.
   *
   * If the payload doesn't have a title or has an empty title, and it also has
   * a URL, then this function also sets the title to the URL's domain.
   *
   * @param {Array} tokens The tokens that should be highlighted in each of the
   *        payload properties.
   * @param {object} payloadInfo An object that looks like this:
   *        { payloadPropertyName: payloadPropertyInfo }
   *
   *        Each payloadPropertyInfo may be either a string or an array.  If
   *        it's a string, then the property value will be that string, and no
   *        highlighting will be applied to it.  If it's an array, then it
   *        should look like this: [payloadPropertyValue, highlightType].
   *        payloadPropertyValue may be a string or an array of strings.  If
   *        it's a string, then the payloadHighlights in the return value will
   *        be an array of match highlights as described in
   *        UrlbarUtils.getTokenMatches().  If it's an array, then
   *        payloadHighlights will be an array of arrays of match highlights,
   *        one element per element in payloadPropertyValue.
   * @returns {{ payload: object, payloadHighlights: object }}
   */
  static payloadAndSimpleHighlights(tokens, payloadInfo) {
    let payload = {};
    let highlightTypes = {};

    for (let [name, valueOrValues] of Object.entries(payloadInfo)) {
      if (Array.isArray(valueOrValues)) {
        if (valueOrValues.length) {
          payload[name] = valueOrValues[0];
          let highlightType = valueOrValues[1];
          if (highlightType) {
            highlightTypes[name] = highlightType;
          }
        }
      } else if (valueOrValues != undefined) {
        payload[name] = valueOrValues;
      }
    }

    if (
      !payload.title &&
      !payload.fallbackTitle &&
      payload.url &&
      typeof payload.url == "string"
    ) {
      // If there's no title, show the domain as the title. Not all valid URLs
      // have a domain.
      highlightTypes.title = lazy.UrlbarUtils.HIGHLIGHT.TYPED;
      try {
        payload.title = new URL(payload.url).URI.displayHostPort;
      } catch (e) {}
    }

    if (payload.url) {
      // For display purposes we need to unescape the url.
      payload.displayUrl = lazy.UrlbarUtils.prepareUrlForDisplay(payload.url);
      highlightTypes.displayUrl = highlightTypes.url;
    }

    // For performance reasons limit excessive string lengths, to reduce the
    // amount of string matching we do here, and avoid wasting resources to
    // handle long textruns that the user would never see anyway.
    for (let prop of ["displayUrl", "title", "suggestion"]) {
      let value = payload[prop];
      if (typeof value == "string") {
        payload[prop] = value.substring(0, lazy.UrlbarUtils.MAX_TEXT_LENGTH);
      }
    }

    let payloadHighlights = {};
    if (tokens) {
      for (let [name, highlightType] of Object.entries(highlightTypes)) {
        let value = payload[name];
        let highlights = Array.isArray(value)
          ? value.map(subval =>
              lazy.UrlbarUtils.getTokenMatches(tokens, subval, highlightType)
            )
          : lazy.UrlbarUtils.getTokenMatches(
              tokens,
              value || "",
              highlightType
            );
        if (highlights.length) {
          payloadHighlights[name] = highlights;
        }
      }
    }

    return { payload, payloadHighlights };
  }

  static _dynamicResultTypesByName = new Map();

  /**
   * Registers a dynamic result type.  Dynamic result types are types that are
   * created at runtime, for example by an extension.  A particular type should
   * be added only once; if this method is called for a type more than once, the
   * `type` in the last call overrides those in previous calls.
   *
   * @param {string} name
   *   The name of the type.  This is used in CSS selectors, so it shouldn't
   *   contain any spaces or punctuation except for -, _, etc.
   * @param {object} type
   *   An object that describes the type.  Currently types do not have any
   *   associated metadata, so this object should be empty.
   */
  static addDynamicResultType(name, type = {}) {
    if (/[^a-z0-9_-]/i.test(name)) {
      console.error(`Illegal dynamic type name: ${name}`);
      return;
    }
    this._dynamicResultTypesByName.set(name, type);
  }

  /**
   * Unregisters a dynamic result type.
   *
   * @param {string} name
   *   The name of the type.
   */
  static removeDynamicResultType(name) {
    let type = this._dynamicResultTypesByName.get(name);
    if (type) {
      this._dynamicResultTypesByName.delete(name);
    }
  }

  /**
   * Returns an object describing a registered dynamic result type.
   *
   * @param {string} name
   *   The name of the type.
   * @returns {object}
   *   Currently types do not have any associated metadata, so the return value
   *   is an empty object if the type exists.  If the type doesn't exist,
   *   undefined is returned.
   */
  static getDynamicResultType(name) {
    return this._dynamicResultTypesByName.get(name);
  }

  /**
   * This is useful for logging results. If you need the full payload, then it's
   * better to JSON.stringify the result object itself.
   *
   * @returns {string} string representation of the result.
   */
  toString() {
    if (this.payload.url) {
      return this.payload.title + " - " + this.payload.url.substr(0, 100);
    }
    if (this.payload.keyword) {
      return this.payload.keyword + " - " + this.payload.query;
    }
    if (this.payload.suggestion) {
      return this.payload.engine + " - " + this.payload.suggestion;
    }
    if (this.payload.engine) {
      return this.payload.engine + " - " + this.payload.query;
    }
    return JSON.stringify(this);
  }

  #type;
  #source;
  #autofill;
  #exposureTelemetry;
  #group;
  #heuristic;
  #hideRowLabel;
  #isBestMatch;
  #isRichSuggestion;
  #isSuggestedIndexRelativeToGroup;
  #providerName;
  #providerType;
  #resultSpan;
  #richSuggestionIconSize;
  #richSuggestionIconVariation;
  #rowLabel;
  #showFeedbackMenu;
  #suggestedIndex;
  #payload;
  #payloadHighlights;
  #testForceNewContent;
}
