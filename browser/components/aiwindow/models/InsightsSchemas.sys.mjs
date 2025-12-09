/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CATEGORIES_LIST, INTENTS_LIST } from "./InsightsConstants.sys.mjs";

/**
 * JSON Schema for initial insights generation
 */
export const INITIAL_INSIGHTS_SCHEMA = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: [
      "category",
      "intent",
      "insight_summary",
      "score",
      "why",
      "evidence",
    ],
    properties: {
      category: {
        type: ["string", "null"],
        enum: [...CATEGORIES_LIST, null],
      },
      intent: {
        type: ["string", "null"],
        enum: [...INTENTS_LIST, null],
      },
      insight_summary: { type: ["string", "null"] },
      score: { type: "integer" },

      why: { type: "string", minLength: 12, maxLength: 200 },

      evidence: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          required: ["type", "value"],
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: ["domain", "title", "search", "chat", "user"],
            },
            value: { type: "string" },
            weight: { type: "number", minimum: 0, maximum: 1 },
            session_ids: {
              type: "array",
              items: { type: ["integer", "string"] },
            },
          },
        },
      },
    },
  },
};

/**
 * JSON Schema for insights deduplication
 */
export const INSIGHTS_DEDUPLICATION_SCHEMA = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["unique_insights"],
    properties: {
      unique_insights: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["main_insight", "duplicates"],
          properties: {
            main_insight: { type: "string" },
            duplicates: {
              type: "array",
              minItems: 1,
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
};

/**
 * JSON schema for filtering sensitive insights
 */
export const INSIGHTS_NON_SENSITIVE_SCHEMA = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["non_sensitive_insights"],
    properties: {
      non_sensitive_insights: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
      },
    },
  },
};

/**
 * JSON schema for classifying message category and intent
 */
export const INSIGHTS_MESSAGE_CLASSIFY_SCHEMA = {
  name: "ClassifyMessage",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["categories", "intents"],
    properties: {
      category: {
        type: "array",
        minItems: 1,
        items: {
          type: ["string", "null"],
          enum: [...CATEGORIES_LIST, null],
        },
      },
      intent: {
        type: "array",
        minItems: 1,
        items: {
          type: ["string", "null"],
          enum: [...INTENTS_LIST, null],
        },
      },
    },
  },
};
