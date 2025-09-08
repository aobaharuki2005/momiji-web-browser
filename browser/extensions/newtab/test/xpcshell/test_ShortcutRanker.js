"use strict";

ChromeUtils.defineESModuleGetters(this, {
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

add_task(async function test_weightedSampleTopSites_no_guid_last() {
  // Ranker are utilities we are testing
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.mjs"
  );
  const provider = new Ranker.RankShortcutsProvider();
  // We are going to stub a database call
  const { NewTabUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/NewTabUtils.sys.mjs"
  );

  await NewTabUtils.init();

  const sandbox = sinon.createSandbox();

  // Stub DB call
  sandbox
    .stub(NewTabUtils.activityStreamProvider, "executePlacesQuery")
    .resolves([
      ["a", 5, 10],
      ["b", 2, 10],
    ]);

  // First item here intentially has no guid
  const input = [
    { url: "no-guid.com" },
    { guid: "a", url: "a.com" },
    { guid: "b", url: "b.com" },
  ];

  const result = await provider.rankTopSites(input, {}, { isStartup: false });

  Assert.ok(Array.isArray(result), "returns an array");
  Assert.equal(
    result[result.length - 1].url,
    "no-guid.com",
    "top-site without GUID is last"
  );

  sandbox.restore();
});

add_task(async function test_sumNorm() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let vec = [1, 1];
  let result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.5, 0.5][i]) < 1e-6),
    "sum norm works as expected for dense array"
  );

  vec = [0, 0];
  result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.0, 0.0][i]) < 1e-6),
    "if sum is 0.0, it should return the original vector, input is zeros"
  );

  vec = [1, -1];
  result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [1.0, -1.0][i]) < 1e-6),
    "if sum is 0.0, it should return the original vector, input contains negatives"
  );
});

add_task(async function test_computeLinearScore() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  let entry = { a: 1, b: 0, bias: 1 };
  let weights = { a: 1, b: 0, bias: 0 };
  let result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 1, "check linear score with one non-zero weight");

  entry = { a: 1, b: 1, bias: 1 };
  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 3, "check linear score with 1 everywhere");

  entry = { bias: 1 };
  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 1, "check linear score with empty entry, get bias");

  entry = { a: 1, b: 1, bias: 1 };
  weights = {};
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 0, "check linear score with empty weights");

  entry = { a: 1, b: 1, bias: 1 };
  weights = { a: 3 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 3, "check linear score with a missing weight");
});

add_task(async function test_interpolateWrappedHistogram() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let hist = [1, 2];
  let t = 0.5;
  let result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(result, 1.5, "test linear interpolation square in the middle");

  hist = [1, 2, 5];
  t = 2.5;
  result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(
    result,
    (hist[0] + hist[2]) / 2,
    "test linear interpolation correctly wraps around"
  );

  hist = [1, 2, 5];
  t = 5;
  result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(
    result,
    hist[2],
    "linear interpolation will wrap around to the last index"
  );
});

add_task(async function test_bayesHist() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  let vec = [1, 2];
  let pvec = [0.5, 0.5];
  let tau = 2;
  let result = Ranker.bayesHist(vec, pvec, tau);
  // checking the math
  // (1+2*.5)/(3+2)........... 2/5
  // (2+2*.5)/(3+2)........... 3/5
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.4, 0.6][i]) < 1e-6),
    "bayes histogram is expected for typical input"
  );
  vec = [1, 2];
  pvec = [0.5, 0.5];
  tau = 0.0;
  result = Ranker.bayesHist(vec, pvec, tau);
  Assert.ok(
    result.every((v, i) => Math.abs(v - vec[i] / 3) < 1e-6), // 3 is sum of vec
    "bayes histogram is a sum norming function if tau is 0"
  );
});

add_task(async function test_normSites() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let Y = {
    a: [2, 2],
    b: [3, 3],
  };
  let result = Ranker.normHistDict(Y);
  Assert.ok(
    result.a.every(
      (v, i) => Math.abs(v - [4 / (4 + 9), 4 / (4 + 9)][i]) < 1e-6
    ),
    "normSites, basic input, first array"
  );
  Assert.ok(
    result.b.every(
      (v, i) => Math.abs(v - [9 / (4 + 9), 9 / (4 + 9)][i]) < 1e-6
    ),
    "normSites, basic input, second array"
  );

  Y = [];
  result = Ranker.normHistDict(Y);
  Assert.deepEqual(result, [], "normSites handles empty array");
});

add_task(async function test_clampWeights() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let weights = { a: 0, b: 1000, bias: 0 };
  let result = Ranker.clampWeights(weights, 100);
  info("clampWeights clamps a big weight vector");
  Assert.equal(result.a, 0);
  Assert.equal(result.b, 100);
  Assert.equal(result.bias, 0);

  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.clampWeights(weights, 100);
  info("clampWeights ignores a small weight vector");
  Assert.equal(result.a, 1);
  Assert.equal(result.b, 1);
  Assert.equal(result.bias, 1);
});

add_task(async function test_updateWeights_batch() {
  // Import the module that exports updateWeights
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  const eta = 1;
  const click_bonus = 1;
  const features = ["a", "b", "bias"];

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }
  function approxEqual(actual, expected, eps = 1e-12) {
    Assert.lessOrEqual(
      Math.abs(actual - expected),
      eps,
      `expected ${actual} ≈ ${expected}`
    );
  }

  //  single click on guid_A updates all weights
  const initial1 = { a: 0, b: 1, bias: 0.1 };
  const scores1 = {
    guid_A: { final: 1.1, a: 1, b: 1, bias: 1 },
  };

  let updated = await Ranker.updateWeights(
    {
      data: { guid_A: { clicks: 1, impressions: 0 } },
      scores: scores1,
      features,
      weights: { ...initial1 },
      eta,
      click_bonus,
    },
    false
  );

  const delta = sigmoid(1.1) - 1; // gradient term for a positive click
  approxEqual(updated.a, 0 - Number(delta) * 1);
  approxEqual(updated.b, 1 - Number(delta) * 1);
  approxEqual(updated.bias, 0.1 - Number(delta) * 1);

  // missing guid -> no-op (weights unchanged)
  const initial2 = { a: 0, b: 1000, bias: 0 };
  const scores2 = {
    guid_A: { final: 1, a: 1, b: 1e-3, bias: 1 },
  };

  updated = await Ranker.updateWeights(
    {
      data: { guid_B: { clicks: 1, impressions: 0 } }, // guid_B not in scores
      scores: scores2,
      features,
      weights: { ...initial2 },
      eta,
      click_bonus,
    },
    false
  );

  Assert.equal(updated.a, 0);
  Assert.equal(updated.b, 1000);
  Assert.equal(updated.bias, 0);
});

add_task(async function test_buildFrecencyFeatures_shape_and_empty() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  // empty inputs → empty feature maps
  let out = await Ranker.buildFrecencyFeatures({}, {});
  Assert.ok(
    out && "refre" in out && "rece" in out && "freq" in out,
    "returns transposed object with feature keys"
  );
  Assert.deepEqual(out.refre, {}, "refre empty");
  Assert.deepEqual(out.rece, {}, "rece  empty");
  Assert.deepEqual(out.freq, {}, "freq  empty");

  // single guid with no visits → zeros
  out = await Ranker.buildFrecencyFeatures({ guidA: [] }, { guidA: 42 });
  Assert.equal(out.refre.guidA, 0, "refre zero with no visits");
  Assert.equal(out.freq.guidA, 0, "freq  zero with no visits");
  Assert.equal(out.rece.guidA, 0, "rece  zero with no visits");
});

add_task(async function test_buildFrecencyFeatures_recency_monotonic() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  const sandbox = sinon.createSandbox();

  // Fix time so the decay is deterministic
  const nowMs = Date.UTC(2025, 0, 1); // Jan 1, 2025
  const clock = sandbox.useFakeTimers({ now: nowMs });

  const dayMs = 864e5;
  // visits use microseconds since epoch; function computes age with visit_date_us / 1000
  const us = v => Math.round(v * 1000);

  const visitsByGuid = {
    // one very recent visit (age ~0d)
    recent: [{ visit_date_us: us(nowMs), visit_type: 2 /* any value */ }],
    // one older visit (age 10d)
    old: [{ visit_date_us: us(nowMs - 10 * dayMs), visit_type: 2 }],
    // both recent + old → should have larger rece (sum of decays)
    both: [
      { visit_date_us: us(nowMs), visit_type: 2 },
      { visit_date_us: us(nowMs - 10 * dayMs), visit_type: 2 },
    ],
  };
  const visitCounts = { recent: 10, old: 10, both: 10 };

  const out = await Ranker.buildFrecencyFeatures(visitsByGuid, visitCounts, {
    halfLifeDays: 28, // default
  });

  Assert.greater(
    out.rece.recent,
    out.rece.old,
    "more recent visit → larger recency score"
  );
  Assert.greater(
    out.rece.both,
    out.rece.recent,
    "two visits (recent+old) → larger recency sum than just recent"
  );

  clock.restore();
  sandbox.restore();
});

add_task(
  async function test_buildFrecencyFeatures_log_scaling_and_interaction() {
    const Ranker = ChromeUtils.importESModule(
      "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
    );
    const sandbox = sinon.createSandbox();
    const clock = sandbox.useFakeTimers({ now: Date.UTC(2025, 0, 1) });

    const nowMs = Date.now();
    const us = v => Math.round(v * 1000);

    // Same single visit (type held constant) for both GUIDs → same rece and same type sum.
    // Only visit_count differs → freq/refre should scale with log1p(visit_count).
    const visitsByGuid = {
      A: [{ visit_date_us: us(nowMs), visit_type: 2 /* 'typed' typically */ }],
      B: [{ visit_date_us: us(nowMs), visit_type: 2 }],
    };
    const visitCounts = { A: 9, B: 99 }; // different lifetime counts

    const out = await Ranker.buildFrecencyFeatures(visitsByGuid, visitCounts);

    // rece should be identical (same timestamps)
    Assert.equal(
      out.rece.A,
      out.rece.B,
      "recency is independent of visit_count"
    );

    // freq and refre should scale with log1p(total)
    const ratio = Math.log1p(visitCounts.B) / Math.log1p(visitCounts.A);
    const approxEqual = (a, b, eps = 1e-9) =>
      Assert.lessOrEqual(Math.abs(a - b), eps);

    approxEqual(out.freq.B / out.freq.A, ratio, 1e-9);
    approxEqual(out.refre.B / out.refre.A, ratio, 1e-9);

    clock.restore();
    sandbox.restore();
  }
);

add_task(async function test_buildFrecencyFeatures_halfLife_effect() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  const sandbox = sinon.createSandbox();
  const nowMs = Date.UTC(2025, 0, 1);
  const clock = sandbox.useFakeTimers({ now: nowMs });

  const dayMs = 864e5;
  const us = v => Math.round(v * 1000);

  // Two visits: one now, one 28 days ago.
  const visits = [
    {
      visit_date_us: us(nowMs),
      visit_type: 1,
    },
    {
      visit_date_us: us(nowMs - 28 * dayMs),
      visit_type: 1,
    },
  ];
  const visitsByGuid = { X: visits };
  const visitCounts = { X: 10 };

  const outShort = await Ranker.buildFrecencyFeatures(
    visitsByGuid,
    visitCounts,
    {
      halfLifeDays: 7, // faster decay
    }
  );
  const outLong = await Ranker.buildFrecencyFeatures(
    visitsByGuid,
    visitCounts,
    {
      halfLifeDays: 56, // slower decay
    }
  );

  Assert.greater(
    outLong.rece.X,
    outShort.rece.X,
    "larger half-life → slower decay → bigger recency sum"
  );

  clock.restore();
  sandbox.restore();
});

add_task(
  async function test_buildFrecencyFeatures_unknown_types_are_zero_bonus() {
    const Ranker = ChromeUtils.importESModule(
      "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
    );
    const sandbox = sinon.createSandbox();
    const clock = sandbox.useFakeTimers({ now: Date.UTC(2025, 0, 1) });

    const nowMs = Date.now();
    const us = v => Math.round(v * 1000);

    // Use an unknown visit_type so TYPE_SCORE[visit_type] falls back to 0.
    const visitsByGuid = {
      U: [{ visit_date_us: us(nowMs), visit_type: 99999 }],
    };
    const visitCounts = { U: 100 };

    const out = await Ranker.buildFrecencyFeatures(visitsByGuid, visitCounts);

    Assert.equal(out.freq.U, 0, "unknown visit_type → zero frequency bonus");
    Assert.equal(out.refre.U, 0, "unknown visit_type → zero interaction");
    Assert.greater(out.rece.U, 0, "recency is still > 0 for a recent visit");

    clock.restore();
    sandbox.restore();
  }
);

add_task(
  async function test_weightedSampleTopSites_new_features_scores_and_norms() {
    const Ranker = ChromeUtils.importESModule(
      "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
    );

    // 2 GUIDs with simple, distinct raw values so ordering is obvious
    const guids = ["g1", "g2"];
    const input = {
      guid: guids,
      features: ["bmark", "rece", "freq", "refre", "bias"],

      // raw feature maps keyed by guid
      bmark_scores: { g1: 1, g2: 0 }, // bookmark flag/intensity
      rece_scores: { g1: 2.0, g2: 1.0 }, // recency-only raw
      freq_scores: { g1: 0.5, g2: 0.25 }, // frequency-only raw
      refre_scores: { g1: 10, g2: 5 }, // interaction raw

      // per-feature normalization state (whatever your normUpdate expects)
      norms: { bmark: null, rece: null, freq: null, refre: null },

      // weights: only new features (and bias) contribute to final
      weights: { bmark: 1, rece: 1, freq: 1, refre: 1, bias: 0 },

      // unused here (no "thom", "hour", "daily")
      clicks: [],
      impressions: [],
      alpha: 1,
      beta: 1,
      tau: 0,
      hourly_seasonality: {},
      daily_seasonality: {},
    };

    // Pre-compute what normUpdate will return for each raw vector,
    // so we can assert exact equality with weightedSampleTopSites output.
    const vecBmark = guids.map(g => input.bmark_scores[g]); // [1, 0]
    const vecRece = guids.map(g => input.rece_scores[g]); // [2, 1]
    const vecFreq = guids.map(g => input.freq_scores[g]); // [0.5, 0.25]
    const vecRefre = guids.map(g => input.refre_scores[g]); // [10, 5]

    const [expBmark, expBmarkNorm] = Ranker.normUpdate(
      vecBmark,
      input.norms.bmark
    );
    const [expRece, expReceNorm] = Ranker.normUpdate(vecRece, input.norms.rece);
    const [expFreq, expFreqNorm] = Ranker.normUpdate(vecFreq, input.norms.freq);
    const [expRefre, expRefreNorm] = Ranker.normUpdate(
      vecRefre,
      input.norms.refre
    );

    const result = await Ranker.weightedSampleTopSites(input);

    // shape
    Assert.ok(
      result && result.score_map && result.norms,
      "returns {score_map, norms}"
    );

    // per-feature, per-guid scores match normUpdate outputs
    Assert.equal(
      result.score_map.g1.bmark,
      expBmark[0],
      "bmark g1 normalized value"
    );
    Assert.equal(
      result.score_map.g2.bmark,
      expBmark[1],
      "bmark g2 normalized value"
    );

    Assert.equal(
      result.score_map.g1.rece,
      expRece[0],
      "rece g1 normalized value"
    );
    Assert.equal(
      result.score_map.g2.rece,
      expRece[1],
      "rece g2 normalized value"
    );

    Assert.equal(
      result.score_map.g1.freq,
      expFreq[0],
      "freq g1 normalized value"
    );
    Assert.equal(
      result.score_map.g2.freq,
      expFreq[1],
      "freq g2 normalized value"
    );

    Assert.equal(
      result.score_map.g1.refre,
      expRefre[0],
      "refre g1 normalized value"
    );
    Assert.equal(
      result.score_map.g2.refre,
      expRefre[1],
      "refre g2 normalized value"
    );

    // updated norms propagated back out
    Assert.deepEqual(result.norms.bmark, expBmarkNorm, "bmark norms updated");
    Assert.deepEqual(result.norms.rece, expReceNorm, "rece norms updated");
    Assert.deepEqual(result.norms.freq, expFreqNorm, "freq norms updated");

    // THIS WILL FAIL until you fix the bug in the refre block:
    //   updated_norms.rece = refre_norm;
    // should be:
    //   updated_norms.refre = refre_norm;
    Assert.deepEqual(result.norms.refre, expRefreNorm, "refre norms updated");

    // final score equals computeLinearScore with provided weights
    const expectedFinalG1 = Ranker.computeLinearScore(
      result.score_map.g1,
      input.weights
    );
    const expectedFinalG2 = Ranker.computeLinearScore(
      result.score_map.g2,
      input.weights
    );
    Assert.equal(
      result.score_map.g1.final,
      expectedFinalG1,
      "final matches linear score (g1)"
    );
    Assert.equal(
      result.score_map.g2.final,
      expectedFinalG2,
      "final matches linear score (g2)"
    );

    // sanity: g1 should outrank g2 with strictly larger raw vectors across all features
    Assert.greaterOrEqual(
      result.score_map.g1.final,
      result.score_map.g2.final,
      "g1 final ≥ g2 final as all contributing features favor g1"
    );
  }
);

add_task(async function test_rankshortcuts_queries_returning_nothing() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.mjs"
  );
  const { NewTabUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/NewTabUtils.sys.mjs"
  );
  await NewTabUtils.init();

  const sandbox = sinon.createSandbox();
  const stub = sandbox
    .stub(NewTabUtils.activityStreamProvider, "executePlacesQuery")
    .resolves([]); // <— mock: query returns nothing

  const topsites = [{ guid: "g1" }, { guid: "g2" }];
  const places = "moz_places";
  const hist = "moz_historyvisits";

  // fetchVisitCountsByGuid: returns {} if no rows come back
  {
    const out = await Ranker.fetchVisitCountsByGuid(topsites, places);
    Assert.deepEqual(out, {}, "visit counts: empty rows → empty map");
  }

  // fetchLast10VisitsByGuid: pre-seeds all guids → each should be []
  {
    const out = await Ranker.fetchLast10VisitsByGuid(topsites, hist, places);
    Assert.deepEqual(
      out,
      { g1: [], g2: [] },
      "last 10 visits: empty rows → each guid has []"
    );
  }

  // fetchBookmarkedFlags: ensures every guid present with false
  {
    const out = await Ranker.fetchBookmarkedFlags(
      topsites,
      "moz_bookmarks",
      places
    );
    Assert.deepEqual(
      out,
      { g1: false, g2: false },
      "bookmarks: empty rows → every guid is false"
    );
  }

  // fetchDailyVisitsSpecific: ensures every guid has a 7-bin zero hist
  {
    const out = await Ranker.fetchDailyVisitsSpecific(topsites, hist, places);
    Assert.ok(
      Array.isArray(out.g1) && out.g1.length === 7,
      "daily specific: 7 bins"
    );
    Assert.ok(
      Array.isArray(out.g2) && out.g2.length === 7,
      "daily specific: 7 bins"
    );
    Assert.ok(
      out.g1.every(v => v === 0) && out.g2.every(v => v === 0),
      "daily specific: all zeros"
    );
  }

  // fetchDailyVisitsAll: returns a 7-bin zero hist
  {
    const out = await Ranker.fetchDailyVisitsAll(hist);
    Assert.ok(Array.isArray(out) && out.length === 7, "daily all: 7 bins");
    Assert.ok(
      out.every(v => v === 0),
      "daily all: all zeros"
    );
  }

  // fetchHourlyVisitsSpecific: ensures every guid has a 24-bin zero hist
  {
    const out = await Ranker.fetchHourlyVisitsSpecific(topsites, hist, places);
    Assert.ok(
      Array.isArray(out.g1) && out.g1.length === 24,
      "hourly specific: 24 bins"
    );
    Assert.ok(
      Array.isArray(out.g2) && out.g2.length === 24,
      "hourly specific: 24 bins"
    );
    Assert.ok(
      out.g1.every(v => v === 0) && out.g2.every(v => v === 0),
      "hourly specific: all zeros"
    );
  }

  // fetchHourlyVisitsAll: returns a 24-bin zero hist
  {
    const out = await Ranker.fetchHourlyVisitsAll(hist);
    Assert.ok(Array.isArray(out) && out.length === 24, "hourly all: 24 bins");
    Assert.ok(
      out.every(v => v === 0),
      "hourly all: all zeros"
    );
  }

  // sanity: we actually exercised the stub at least once
  Assert.greater(stub.callCount, 0, "executePlacesQuery was called");

  sandbox.restore();
});

// cover the explicit "no topsites" early-return branches
add_task(async function test_rankshortcuts_no_topsites_inputs() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.mjs"
  );
  const { NewTabUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/NewTabUtils.sys.mjs"
  );
  await NewTabUtils.init();

  const sandbox = sinon.createSandbox();
  const stub = sandbox
    .stub(NewTabUtils.activityStreamProvider, "executePlacesQuery")
    .resolves([]); // should not matter (early return)

  // empty topsites → {}
  Assert.deepEqual(
    await Ranker.fetchVisitCountsByGuid([], "moz_places"),
    {},
    "visit counts early return {}"
  );
  Assert.deepEqual(
    await Ranker.fetchLast10VisitsByGuid([], "moz_historyvisits", "moz_places"),
    {},
    "last10 early return {}"
  );
  Assert.deepEqual(
    await Ranker.fetchBookmarkedFlags([], "moz_bookmarks", "moz_places"),
    {},
    "bookmarks early return {}"
  );
  Assert.deepEqual(
    await Ranker.fetchDailyVisitsSpecific(
      [],
      "moz_historyvisits",
      "moz_places"
    ),
    {},
    "daily specific early return {}"
  );
  Assert.deepEqual(
    await Ranker.fetchHourlyVisitsSpecific(
      [],
      "moz_historyvisits",
      "moz_places"
    ),
    {},
    "hourly specific early return {}"
  );

  // note: the *All* variants don't take topsites and thus aren't part of this early-return set.

  // make sure we didn't query DB for early-return cases
  Assert.equal(stub.callCount, 0, "no DB calls for early-return functions");

  sandbox.restore();
});

add_task(async function test_rankTopSites_sql_pipeline_happy_path() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.mjs"
  );
  const { NewTabUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/NewTabUtils.sys.mjs"
  );

  await NewTabUtils.init();
  const sandbox = sinon.createSandbox();

  // freeze time so recency/seasonality are stable
  const nowFixed = Date.UTC(2025, 0, 1, 12, 0, 0); // Jan 1, 2025 @ noon UTC
  const clock = sandbox.useFakeTimers({ now: nowFixed });

  // inputs: one strong site (g1), one weaker (g2), and one without guid
  const topsites = [
    { guid: "g1", url: "https://g1.com", frecency: 1000 },
    { guid: "g2", url: "https://g2.com", frecency: 10 },
    { url: "https://no-guid.com" }, // should end up last
  ];

  // provider under test
  const provider = new Ranker.RankShortcutsProvider();

  // keep cache interactions in-memory + observable
  const initialWeights = {
    bmark: 1,
    rece: 1,
    freq: 1,
    refre: 1,
    hour: 1,
    daily: 1,
    bias: 0,
    frec: 0,
  };
  const fakeCache = {
    weights: { ...initialWeights },
    init_weights: { ...initialWeights },
    norms: null,
    // minimal score_map so updateWeights can run even if eta > 0 (we set eta=0 below)
    score_map: { g1: { final: 0 }, g2: { final: 0 } },
  };
  sandbox.stub(provider.sc_obj, "get").resolves(fakeCache);
  const setSpy = sandbox.stub(provider.sc_obj, "set").resolves();

  // stub DB: return realistic rows per SQL shape
  const execStub = sandbox
    .stub(NewTabUtils.activityStreamProvider, "executePlacesQuery")
    .callsFake(async sql => {
      const s = String(sql);

      // --- Bookmarks (fetchBookmarkedFlags)
      if (s.includes("FROM moz_bookmarks")) {
        // rows: [key, bookmark_count]
        return [
          ["g1", 2], // bookmarked
          ["g2", 0], // not bookmarked
        ];
      }

      // --- Visit counts (fetchVisitCountsByGuid)
      if (s.includes("COALESCE(p.visit_count")) {
        // rows: [guid, visit_count]
        return [
          ["g1", 42],
          ["g2", 3],
        ];
      }

      // --- Last 10 visits (fetchLast10VisitsByGuid)
      if (s.includes("LIMIT 10") && s.includes("ORDER BY vv.visit_date DESC")) {
        // rows: [guid, visit_date_us, visit_type], ordered by guid/date DESC
        const nowUs = nowFixed * 1000;
        const dayUs = 864e8;
        // g1: two recent visits (typed + link); g2: one older link
        return [
          ["g1", nowUs, 2], // TYPED
          ["g1", nowUs - 1 * Number(dayUs), 1], // LINK (yesterday)
          ["g2", nowUs - 10 * Number(dayUs), 1], // LINK (older)
        ];
      }

      // --- Daily specific (fetchDailyVisitsSpecific): rows [key, dow, count]
      if (
        s.includes("strftime('%w'") &&
        s.includes("GROUP BY place_ids.guid")
      ) {
        return [
          ["g1", 1, 3], // Mon
          ["g1", 2, 2], // Tue
          ["g2", 1, 1], // Mon
        ];
      }

      // --- Daily all (fetchDailyVisitsAll): rows [dow, count]
      if (s.includes("strftime('%w'") && !s.includes("place_ids.guid")) {
        return [
          [0, 10],
          [1, 20],
          [2, 15],
          [3, 12],
          [4, 8],
          [5, 5],
          [6, 4],
        ];
      }

      // --- Hourly specific (fetchHourlyVisitsSpecific): rows [key, hour, count]
      if (
        s.includes("strftime('%H'") &&
        s.includes("GROUP BY place_ids.guid")
      ) {
        return [
          ["g1", 9, 5],
          ["g1", 10, 3],
          ["g2", 9, 1],
        ];
      }

      // --- Hourly all (fetchHourlyVisitsAll): rows [hour, count]
      if (s.includes("strftime('%H'") && !s.includes("place_ids.guid")) {
        return Array.from({ length: 24 }, (_, h) => [
          h,
          h >= 8 && h <= 18 ? 10 : 2,
        ]);
      }

      // --- Shortcut interactions (fetchShortcutInteractions)
      // The query varies by implementation; if your helper hits SQL, fall back to "empty"
      if (
        s.toLowerCase().includes("shortcut") ||
        s.toLowerCase().includes("smartshortcuts")
      ) {
        return [];
      }

      // default: empty for any other SQL the provider might issue
      return [];
    });

  // prefs: set eta=0 so updateWeights is a no-op (deterministic)
  // NOTE: Feature set comes from the module's SHORTCUT_FSETS.
  // If your build's default fset already includes ["bmark","rece","freq","refre","hour","daily","bias","frec"],
  // this test will exercise all the SQL above. If not, it still passes the core assertions.
  const prefValues = {
    smartShortcutsConfig: {
      // fset: "custom", // uncomment iff your build defines a "custom" fset you want to use
      eta: 0,
      click_bonus: 10,
      positive_prior: 1,
      negative_prior: 1,
    },
  };

  // run
  const out = await provider.rankTopSites(topsites, prefValues, {
    isStartup: false,
  });

  // assertions
  Assert.ok(Array.isArray(out), "returns an array");
  Assert.equal(
    out[out.length - 1].url,
    "https://no-guid.com",
    "no-guid item is last"
  );

  // If the active fset includes the “new” features, g1 should outrank g2 based on our SQL.
  const rankedGuids = out.filter(x => x.guid).map(x => x.guid);
  if (rankedGuids.length === 2) {
    // This is a soft assertion—kept as ok() instead of equal() so the test still passes
    // on builds where the active fset does not include those features.
    Assert.strictEqual(
      rankedGuids[0],
      "g1",
      `expected g1 to outrank g2 when feature set includes (bmark/rece/freq/refre/hour/daily); got ${rankedGuids}`
    );
  }

  // cache writes happened (norms + score_map)
  Assert.ok(setSpy.calledWith("norms"), "norms written to cache");
  Assert.ok(setSpy.calledWith("score_map"), "score_map written to cache");

  // sanity: DB stub exercised
  Assert.greater(execStub.callCount, 0, "executePlacesQuery was called");

  // cleanup
  clock.restore();
  sandbox.restore();
});
