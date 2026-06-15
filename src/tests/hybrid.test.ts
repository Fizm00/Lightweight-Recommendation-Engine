import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Hybrid Strategy - Constructor Configuration Validations", () => {
  assert.throws(() => {
    new NanoRecommender({ defaultHybridAlpha: -0.1 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultHybridAlpha: 1.05 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultHybridAlpha: "0.5" as any });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultHybridAlpha: NaN });
  }, ValidationError);
});

test("Hybrid Strategy - Query Option Validations", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 5.0 },
  ]);

  assert.throws(() => {
    recommender.recommend("u1", { strategy: "hybrid", hybridAlpha: -0.5 });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", { strategy: "hybrid", hybridAlpha: 1.2 });
  }, ValidationError);
});

test("Hybrid Strategy - Blending Calculations & Correctness", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
    defaultHybridAlpha: 0.5,
  });

  // Load a matrix where:
  // u1 rated i1, i2.
  // We want to predict for candidates i3 and i4.
  // Item-Based CF similarity scores:
  // i1-i3 shares u2 (rating 5.0 on both i1 and i3). Say CF score is high.
  // i2-i4 shares u3 (rating 5.0 on i2, rating 4.0 on i4). Say CF score is lower.
  // Popularity counts:
  // i3: rated 2 times (by u2 and u4)
  // i4: rated 4 times (by u3, u4, u5, u6) - much more popular than i3!
  recommender.load([
    // Target user
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate" },
    { userId: "u1", itemId: "i2", rating: 3.0, type: "rate" },

    // Similarity helpers
    { userId: "u2", itemId: "i1", rating: 5.0, type: "rate" },
    { userId: "u2", itemId: "i3", rating: 5.0, type: "rate" },

    { userId: "u3", itemId: "i2", rating: 5.0, type: "rate" },
    { userId: "u3", itemId: "i4", rating: 4.0, type: "rate" },

    // Popularity pumpers for i4
    { userId: "u4", itemId: "i4", rating: 3.0, type: "rate" },
    { userId: "u5", itemId: "i4", rating: 3.0, type: "rate" },
    { userId: "u6", itemId: "i4", rating: 3.0, type: "rate" },

    // Popularity pumper for i3
    { userId: "u4", itemId: "i3", rating: 1.0, type: "rate" },
  ]);

  // 1. Pure CF (hybridAlpha = 1.0)
  // i3 has higher CF score than i4 (predicting from i1 rating 5.0 vs i2 rating 3.0).
  // So with alpha = 1.0, i3 should rank first.
  const recsCf = recommender.recommend("u1", { hybridAlpha: 1.0 });
  assert.strictEqual(recsCf[0]?.itemId, "i3");

  // 2. Pure Popularity (hybridAlpha = 0.0)
  // i4 is rated 4 times (u3, u4, u5, u6) while i3 is rated 2 times (u2, u4).
  // So with alpha = 0.0, i4 should rank first.
  const recsPop = recommender.recommend("u1", { hybridAlpha: 0.0 });
  assert.strictEqual(recsPop[0]?.itemId, "i4");

  // 3. Balanced Hybrid (hybridAlpha = 0.5)
  // i3 has CF = normalized 1.0, Pop = normalized 0.0. Hybrid = 0.5 * 1.0 + 0.5 * 0.0 = 0.5.
  // i4 has CF = normalized 0.0, Pop = normalized 1.0. Hybrid = 0.5 * 0.0 + 0.5 * 1.0 = 0.5.
  // Let's verify both are recommended.
  const recsHybrid = recommender.recommend("u1", { hybridAlpha: 0.5 });
  assert.strictEqual(recsHybrid.length, 2);
});

test("Hybrid Strategy - Cold Start Fallback", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate" },
    { userId: "u2", itemId: "i2", rating: 5.0, type: "rate" },
    { userId: "u2", itemId: "i2", rating: 5.0, type: "view" },
  ]);

  // uNew has no interactions. Should fallback to popularity.
  const recs = recommender.recommend("uNew", { fallbackStrategy: "most-rated" });
  assert.ok(recs.length > 0);
});
