import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";

test("NanoRecommender - load, clear, and stats", () => {
  const recommender = new NanoRecommender();

  // Initial stats
  const initialStats = recommender.stats();
  assert.strictEqual(initialStats.userCount, 0);
  assert.strictEqual(initialStats.itemCount, 0);
  assert.strictEqual(initialStats.interactionCount, 0);

  // Load interactions
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
  ]);

  const statsAfterLoad = recommender.stats();
  assert.strictEqual(statsAfterLoad.userCount, 2);
  assert.strictEqual(statsAfterLoad.itemCount, 2);
  assert.strictEqual(statsAfterLoad.interactionCount, 3);

  // Clear
  recommender.clear();
  const statsAfterClear = recommender.stats();
  assert.strictEqual(statsAfterClear.userCount, 0);
  assert.strictEqual(statsAfterClear.itemCount, 0);
  assert.strictEqual(statsAfterClear.interactionCount, 0);
});

test("NanoRecommender - recommend options and strategies", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
  ]);

  // Default recommend calls item-based
  const defaultRecs = recommender.recommend("u1");
  assert.strictEqual(defaultRecs.length, 1);
  assert.strictEqual(defaultRecs[0]?.itemId, "i3");

  // Explicit item-based call
  const itemRecs = recommender.recommendItemBased("u1");
  assert.strictEqual(itemRecs.length, 1);
  assert.strictEqual(itemRecs[0]?.itemId, "i3");

  // Explicit user-based call via recommend()
  const userRecs = recommender.recommend("u1", { strategy: "user-based" });
  assert.strictEqual(userRecs.length, 1);
  assert.strictEqual(userRecs[0]?.itemId, "i3");

  // Explicit recommendUserBased call
  const directUserRecs = recommender.recommendUserBased("u1");
  assert.strictEqual(directUserRecs.length, 1);
  assert.strictEqual(directUserRecs[0]?.itemId, "i3");
});

test("NanoRecommender - Constructor configuration overrides", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "user-based",
    defaultSimilarityThreshold: 0.5,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
  ]);

  // Default recommend should run user-based because of defaultStrategy config.
  // And similarityThreshold is 0.5, which filters out u3 (sim 0.321), predicting score 2.0 for i3.
  const recs = recommender.recommend("u1");
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 2.0) < 1e-9);
});
