import test from "node:test";
import assert from "node:assert";
import { SimilarityCache } from "../core/cache.js";
import { NanoRecommender } from "../recommender.js";

test("SimilarityCache - Symmetric Keys", () => {
  const cache = new SimilarityCache();
  cache.set("a", "b", 0.85);

  assert.strictEqual(cache.get("a", "b"), 0.85);
  assert.strictEqual(cache.get("b", "a"), 0.85);
  assert.strictEqual(cache.size(), 1);
});

test("SimilarityCache - Clear", () => {
  const cache = new SimilarityCache();
  cache.set("a", "b", 0.5);
  cache.set("c", "d", 0.8);
  assert.strictEqual(cache.size(), 2);

  cache.clear();
  assert.strictEqual(cache.size(), 0);
  assert.strictEqual(cache.get("a", "b"), undefined);
});

test("NanoRecommender - Cache Invalidation on Load and Clear", () => {
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

  const itemCache = recommender["itemCache"];
  const userCache = recommender["userCache"];

  assert.strictEqual(itemCache.size(), 0);
  assert.strictEqual(userCache.size(), 0);

  // Trigger item-based recommendation (populates itemCache)
  recommender.recommendItemBased("u1");
  assert.ok(itemCache.size() > 0);
  assert.strictEqual(userCache.size(), 0);

  // Trigger user-based recommendation (populates userCache)
  recommender.recommendUserBased("u1");
  assert.ok(userCache.size() > 0);

  // Load new dataset -> should invalidate caches
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
  ]);
  assert.strictEqual(itemCache.size(), 0);
  assert.strictEqual(userCache.size(), 0);

  // Populate again
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
  ]);
  recommender.recommendItemBased("u1");
  assert.ok(itemCache.size() > 0);

  // Clear -> should invalidate caches
  recommender.clear();
  assert.strictEqual(itemCache.size(), 0);
  assert.strictEqual(userCache.size(), 0);
});

test("NanoRecommender - Cache Hit & Correctness", () => {
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

  // First run - populates cache
  const recs1 = recommender.recommendItemBased("u1");

  // Modify cached value directly to verify cache hit
  const itemCache = recommender["itemCache"];
  
  // Force a very high similarity for a pair in the item cache.
  // The first run computed the similarity between i1/i2 and i3.
  // Let's set the similarity between "i2" and "i3" to 0.999.
  itemCache.set("i2", "i3", 0.999);
  
  // Re-run recommendation. It should use 0.999, changing the score prediction for "i3".
  const recs2 = recommender.recommendItemBased("u1");
  
  assert.notDeepStrictEqual(recs1, recs2);
});
