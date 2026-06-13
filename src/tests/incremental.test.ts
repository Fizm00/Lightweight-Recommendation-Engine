import { test } from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Recommender Incremental Updates - Basic addInteraction", () => {
  const recommender = new NanoRecommender();
  
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
  ]);

  assert.strictEqual(recommender.stats().interactionCount, 1);

  // Add a new interaction in real-time
  recommender.addInteraction({ userId: "u1", itemId: "i2", rating: 4.0 });

  assert.strictEqual(recommender.stats().interactionCount, 2);
  const state = recommender.export();
  assert.strictEqual(state.matrix.storage.u1?.i2, 4.0);
});

test("Recommender Incremental Updates - Weighting & Decay", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const recommender = new NanoRecommender({
    interactionWeights: { purchase: 2.0 },
    decayHalfLifeDays: 10,
  });

  // Set initial lastReferenceTimeMs by loading a dataset
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, timestamp: now },
  ]);

  // 1. Add interaction with weight
  recommender.addInteraction({
    userId: "u1",
    itemId: "i2",
    rating: 3.0,
    type: "purchase",
  }); // 3.0 * 2.0 = 6.0 (no decay since no timestamp)

  // 2. Add interaction with weight and decay
  recommender.addInteraction({
    userId: "u1",
    itemId: "i3",
    rating: 4.0,
    type: "purchase",
    timestamp: now - 10 * ONE_DAY_MS, // 10 days old relative to 'now' -> half weight -> 4.0 * 2.0 * 0.5 = 4.0
  });

  const state = recommender.export();
  assert.strictEqual(state.matrix.storage.u1?.i2, 6.0);
  assert.strictEqual(state.matrix.storage.u1?.i3, 4.0);
});

test("Recommender Incremental Updates - Selective Cache Invalidation", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i1", rating: 2.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
  ]);

  // Populate cache by calling recommend
  recommender.recommend("u1"); // This computes similarities and populates caches

  // Export state to see storage but check caches indirectly via recomendation scores
  const scoreBefore = recommender.recommend("u1").find(r => r.itemId === "i3")?.score ?? 0;

  // Add a new interaction in real-time for u2 and i3, which should invalidate i3 and u2 cache entries
  recommender.addInteraction({ userId: "u2", itemId: "i3", rating: 4.0 });

  // Get new recommendation; the score should change immediately because caches for u3 and i3 are invalidated
  const scoreAfter = recommender.recommend("u1").find(r => r.itemId === "i3")?.score ?? 0;

  assert.notStrictEqual(scoreBefore, scoreAfter);
});

test("Recommender Incremental Updates - Validation Errors", () => {
  const recommender = new NanoRecommender();

  // 1. Null/undefined
  assert.throws(() => {
    recommender.addInteraction(null as any);
  }, ValidationError);

  // 2. Missing/Empty userId
  assert.throws(() => {
    recommender.addInteraction({ userId: "", itemId: "i1", rating: 5.0 });
  }, ValidationError);

  assert.throws(() => {
    recommender.addInteraction({ userId: 123 as any, itemId: "i1", rating: 5.0 });
  }, ValidationError);

  // 3. Missing/Empty itemId
  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "", rating: 5.0 });
  }, ValidationError);

  // 4. Invalid rating
  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "i1", rating: NaN });
  }, ValidationError);

  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "i1", rating: Infinity });
  }, ValidationError);

  // 5. Invalid timestamp format
  const recommenderWithDecay = new NanoRecommender({ decayHalfLifeDays: 5 });
  recommenderWithDecay.load([{ userId: "u1", itemId: "i1", rating: 5.0 }]);

  assert.throws(() => {
    recommenderWithDecay.addInteraction({
      userId: "u1",
      itemId: "i2",
      rating: 5.0,
      timestamp: "invalid-date-string",
    });
  }, ValidationError);
});
