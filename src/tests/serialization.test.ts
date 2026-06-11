import { test } from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";
import type { RecommenderState } from "../types/index.js";

test("Recommender Serialization - Happy Path (Export and Import)", () => {
  const recommender = new NanoRecommender();
  
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate" },
    { userId: "u1", itemId: "i2", rating: 3.0, type: "view" },
    { userId: "u2", itemId: "i1", rating: 4.0, type: "purchase" },
    { userId: "u2", itemId: "i3", rating: 2.0, type: "rate" },
  ];
  
  recommender.load(dataset);

  const initialStats = recommender.stats();
  const initialRecs = recommender.recommend("u1", { limit: 5 });

  // Export the state
  const serialized = recommender.export();

  assert.strictEqual(serialized.version, "1");
  assert.ok(serialized.matrix);
  assert.ok(serialized.matrix.storage.u1);
  assert.strictEqual(serialized.matrix.storage.u1.i1, 5.0);
  assert.strictEqual(serialized.matrix.viewsCount.i2, 1);
  assert.strictEqual(serialized.matrix.purchasesCount.i1, 1);

  // Import into a clean recommender
  const newRecommender = new NanoRecommender();
  newRecommender.import(serialized);

  const importedStats = newRecommender.stats();
  assert.deepStrictEqual(importedStats, initialStats);

  const importedRecs = newRecommender.recommend("u1", { limit: 5 });
  assert.deepStrictEqual(importedRecs, initialRecs);
});

test("Recommender Serialization - Cache Invalidation on Import", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
  ]);

  // Run a recommendation to populate the cache
  recommender.recommend("u1");

  const state = recommender.export();

  // Import should clear caches internally
  recommender.import(state);

  // Stats should remain correct
  const stats = recommender.stats();
  assert.strictEqual(stats.userCount, 2);
  assert.strictEqual(stats.itemCount, 2);
});

test("Recommender Serialization - Validation Errors", () => {
  const recommender = new NanoRecommender();

  // 1. Null/undefined state
  assert.throws(() => {
    recommender.import(null as any);
  }, ValidationError);

  // 2. Unsupported version
  assert.throws(() => {
    recommender.import({ version: "2", matrix: {} as any });
  }, ValidationError);

  // 3. Missing matrix
  assert.throws(() => {
    recommender.import({ version: "1" } as any);
  }, ValidationError);

  // 4. Invalid matrix structure
  assert.throws(() => {
    recommender.import({
      version: "1",
      matrix: { storage: null } as any,
    });
  }, ValidationError);

  // 5. Invalid userId
  assert.throws(() => {
    recommender.import({
      version: "1",
      matrix: {
        storage: { "": { i1: 5 } },
        ratingsCount: {},
        viewsCount: {},
        purchasesCount: {},
      },
    });
  }, ValidationError);

  // 6. Invalid rating
  assert.throws(() => {
    recommender.import({
      version: "1",
      matrix: {
        storage: { u1: { i1: NaN } },
        ratingsCount: {},
        viewsCount: {},
        purchasesCount: {},
      },
    });
  }, ValidationError);

  // 7. Invalid counts
  assert.throws(() => {
    recommender.import({
      version: "1",
      matrix: {
        storage: { u1: { i1: 5 } },
        ratingsCount: { i1: -1 },
        viewsCount: {},
        purchasesCount: {},
      },
    });
  }, ValidationError);
});
