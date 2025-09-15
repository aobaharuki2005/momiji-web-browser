/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @typedef {import("../../content/Utils.sys.mjs").ProgressAndStatusCallbackParams} ProgressAndStatusCallbackParams
 */

/* eslint-disable-next-line mozilla/reject-import-system-module-from-non-system */
import { Progress } from "chrome://global/content/ml/Utils.sys.mjs";

/* eslint-disable-next-line mozilla/reject-import-system-module-from-non-system */
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

/**
 * Log level set by the pipeline.
 *
 * @type {string}
 */
let _logLevel = "Error";

/**
 * Lazy initialization container.
 *
 * @type {object}
 */
const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "console", () => {
  return console.createInstance({
    maxLogLevel: _logLevel, // we can't use maxLogLevelPref in workers.
    prefix: "ML:OpenAIPipeline",
  });
});
ChromeUtils.defineESModuleGetters(
  lazy,
  {
    setLogLevel: "chrome://global/content/ml/Utils.sys.mjs",
  },
  { global: "current" }
);

export class OpenAIPipeline {
  #errorFactory = null;
  #options = null;
  OpenAILib = null;

  constructor(options, errorFactory) {
    this.#errorFactory = errorFactory;
    this.#options = options;
  }

  static async initialize(mlEngineWorker, wasm, options = {}, errorFactory) {
    lazy.console.debug("Initializing OpenAI pipeline");
    if (AppConstants.NIGHTLY_BUILD) {
      OpenAIPipeline.OpenAILib = await import(
        "chrome://global/content/ml/openai-dev.mjs"
      );
    } else {
      OpenAIPipeline.OpenAILib = await import(
        "chrome://global/content/ml/openai.mjs"
      );
    }
    if (options.logLevel) {
      _logLevel = options.logLevel;
      lazy.setLogLevel(options.logLevel); // setting Utils log level
    }
    let config = {};
    options.applyToConfig(config);
    config.backend = config.backend || "openai";

    // reapply logLevel if it has changed.
    if (lazy.console.logLevel != config.logLevel) {
      lazy.console.logLevel = config.logLevel;
    }

    return new OpenAIPipeline(config, errorFactory);
  }

  async run(
    request,
    requestId = null,
    inferenceProgressCallback = null,
    port = null
  ) {
    lazy.console.debug("Running OpenAI pipeline");
    try {
      const baseURL = this.#options.baseURL || "http://localhost:11434/v1";
      const client = new OpenAIPipeline.OpenAILib.OpenAI({
        baseURL,
        apiKey: this.#options.apiKey || "ollama",
      });

      const completion = await client.chat.completions.create({
        model: this.#options.modelId,
        messages: request.args,
      });

      const output = completion.choices[0].message.content;
      port?.postMessage({ done: true, finalOutput: output, ok: true });

      inferenceProgressCallback?.({
        ok: true,
        metadata: {
          text: output,
          requestId,
          tokens: [],
        },
        type: Progress.ProgressType.INFERENCE,
        statusText: Progress.ProgressStatusText.DONE,
      });

      return { done: true, finalOutput: output, ok: true, metrics: [] };
    } catch (error) {
      const backendError = this.#errorFactory(error);
      port?.postMessage({ done: true, ok: false, error: backendError });
      inferenceProgressCallback?.({
        ok: false,
        metadata: {
          text: "",
          requestId,
          tokens: [],
        },
        type: Progress.ProgressType.INFERENCE,
        statusText: Progress.ProgressStatusText.DONE,
      });

      throw backendError;
    }
  }
}
