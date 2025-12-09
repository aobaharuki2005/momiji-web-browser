/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const initialInsightsGenerationSystemPromptMetadata = {
  version: "0.1",
};

export const initialInsightsGenerationSystemPrompt =
  "You are a privacy respecting data analyst who tries to generate useful insights about user preferences EXCLUDING personal, medical, health, financial, political, religion, private and any sensitive activities of users. Return ONLY valid JSON.";

export const initialInsightsGenerationPromptMetadata = {
  version: "0.1",
};

export const initialInsightsGenerationPrompt = `
# Overview
You are an expert at extracting insights from user browser data. An insight is a short, concise statement about user interests or behaviors (products, brands, behaviors) that can help personalize their experience.

You will receive CSV tables and/or JSON objects of data representing the user's browsing history, search history, and chat history. Use ONLY this data to generate insights. Each table has a header row that defines the schema.

# Instructions
- Extract up as many insights as you can.
- Each insight must be supported by 1-4 pieces of evidence from the user records. ONLY USE VERBATIM STRINGS FROM THE USER RECORDS!
- Insights are user preferences (products, brands, behaviors) useful for future personalization.
- Do not imagine actions without evidence. Prefer "shops for / plans / looked for" over "bought / booked / watched" unless explicit.
- Do not include personal names unless widely public (avoid PII).
- Base insights on patterns, not single instances.

## Exemplars
Below are examples of high quality insights (for reference only; do NOT copy):
- "Prefers LLBean & Nordstrom formalwear collections"
- "Compares white jeans under $80 at Target"
- "Streams new-release movies via Fandango"
- "Cooks Mediterranean seafood from TasteAtlas recipes"
- "Tracks minimalist fashion drops at Uniqlo"

## Category rules
Every insight requires a category. Choose ONLY one from this list; if none fits, use null:
{categoriesList}

## Intent rules
Every insight requires an intent. Choose ONLY one from this list; if none fits, use null:
{intentsList}

# Output Schema

Return ONLY a JSON array of objects, no prose, no code fences. Each object must have:
\`\`\`json
[
  {
    "why": "<12-40 words that briefly explains the rationale, referencing the cited evidence (no new claims or invented entities).>",
    "category": "<one of the categories or null>",
    "intent": "<one of the intents or null>",
    "insight_summary": "<4-10 words, crisp and specific or null>",
    "score": <integer 1-5>,
    "evidence": [
      {
        "type": "<one of ["domain","title","search","chat","user"]>",
        "value": "<a **verbatim** string copied from profile_records (for domain/title/search) or a short user/chat quote>",
        "session_ids": ["<optional array of session ids (if available from inputs)>"],
        "weight": <float 0-1 indicating contribution strength>
      },
      ...
    ]
  }
]
\`\`\`

## Scoring priorities
- Base "score" on *strength + recency*; boost multi-source corroboration.
- Source priority: user (highest) > chat > search > history (lowest).
- Typical caps: recent history ≤1; search up to 2; multi-source 2-3; recent chat 4; explicit user 5.
- Do not assign 5 unless pattern is strong and recent.

# Inputs
Analyze the records below to generate as many unique, non-sensitive, specific user insights as possible. Each set of records is a CSV table with header row that defines the schema or JSON object.

{profileRecordsRenderedStr}

** CREATE ALL POSSIBLE UNIQUE INSIGHTS WITHOUT VIOLATING THE RULES ABOVE **`.trim();

export const insightsDeduplicationSystemPromptMetadata = {
  version: "0.1",
};

export const insightsDeduplicationSystemPrompt =
  "You are an expert at identifying duplicate statements. Return ONLY valid JSON.";

export const insightsDeduplicationPromptMetadata = {
  version: "0.1",
};

export const insightsDeduplicationPrompt = `
You are an expert at identifying duplicate statements.

Examine the following list of statements and find the unique ones. If you identify a set of statements that express the same general idea, pick the most general one from the set as the "main insight" and mark the rest as duplicates of it.

There are 2 lists of statements: Existing Statements and New Statements. If you find a duplicate between the 2, **ALWAYS** pick the Existing Statement as the "main insight".

If all statements are unique, simply return them all.

## Existing Statements:
{existingInsightsList}

## New Statements:
{newInsightsList}

Return ONLY JSON per the schema below.
\`\`\`json
{
  "unique_insights": [
    {
      "main_insight": "<the main unique insight statement>",
      "duplicates": [
        "<duplicate_statement_1>",
        "<duplicate_statement_2>",
        ...
      ]
    },
    ...
  ]
}
\`\`\``.trim();

export const insightSensitivityFilterSystemPromptMetadata = {
  version: "0.1",
};

export const insightSensitivityFilterSystemPrompt =
  "You are an expert at identifying sensitive statements and content. Return ONLY valid JSON.";

export const insightsSensitivityFilterPromptMetadata = {
  version: "0.1",
};

export const insightsSensitivityFilterPrompt = `
You are an expert at identifying sensitive statements and content.

Examine the following list of statements and filter out any that contain sensitive information or content.
Sensitive information includes, but is not limited to:

- Medical/Health: diagnoses, symptoms, treatments, conditions, mental health, pregnancy, fertility, contraception.
- Finance: income/salary/compensation, bank/credit card details, credit score, loans/mortgage, taxes/benefits, debt/collections, investments/brokerage.
- Legal: lawsuits, settlements, subpoenas/warrants, arrests/convictions, immigration status/visas/asylum, divorce/custody, NDAs.
- Politics/Demographics/PII: political leaning/affiliation, religion, race/ethnicity, gender/sexual orientation, addresses/phones/emails/IDs.

Below are exemplars of sensitive statements:
- "Researches treatment about arthritis"
- "Searches about pregnancy tests online"
- "Pediatrician in San Francisco"
- "Political leaning towards a party"
- "Research about ethnicity demographics in a city"
- "Negotiates debt settlement with bank"
- "Prepares documents for divorce hearing"
- "Tracks mortgage refinance rates"
- "Applies for work visa extension"
- "Marie, female from Ohio looking for rental apartments"

If all statements are not sensitive, simply return them all.

Here are the statements to analyze:
{insightsList}

Return ONLY JSON per the schema below.
\`\`\`json
{
  "non_sensitive_insights": [
    "<insight_statement_1>",
    "<insight_statement_2>",
    ...
  ]
}
\`\`\``.trim();

export const messageInsightClassificationSystemPromptMetadata = {
  version: "0.1",
};

export const messageInsightClassificationSystemPrompt =
  "Classify the user's message into one more more high-level Categories and Intents. Return ONLY valid JSON per schema.";

export const messageInsightClassificationPrompt = `
{message}

Pick Categories from:
{categories}

Pick Intents from:
{intents}

Guidance:
- Choose the most directly implied category/intent.
- If ambiguous, pick the closest likely choice.
- Keep it non-sensitive and general; do NOT fabricate specifics.

Return ONLY JSON per the schema below.
\`\`\`json
{
  "categories": ["<category 1>", "<category 2>", ...],
  "intents": ["<intent 1>", "<intent 2>", ...]
}
\`\`\``.trim();
