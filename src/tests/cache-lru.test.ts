import { test } from "node:test";
import assert from "node:assert";
import { SimilarityCache } from "../core/cache.js";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("SimilarityCache - LRU Eviction", () => {
  // Create cache with max 3 entries
  const cache = new SimilarityCache(3);

  cache.set("a", "b", 0.1); // insertion order: [a:b]
  cache.set("b", "c", 0.2); // insertion order: [a:b, b:c]
  cache.set("c", "d", 0.3); // insertion order: [a:b, b:c, c:d]

  assert.strictEqual(cache.size(), 3);

  // Access a:b, which moves it to the most recently used (end of insertion order)
  // order becomes: [b:c, c:d, a:b]
  const score = cache.get("a", "b");
  assert.strictEqual(score, 0.1);

  // Add 4th entry. This should evict the oldest: b:c
  cache.set("d", "e", 0.4);

  assert.strictEqual(cache.size(), 3);
  assert.strictEqual(cache.get("b", "c"), undefined); // Evicted!
  assert.strictEqual(cache.get("a", "b"), 0.1); // Maintained
  assert.strictEqual(cache.get("c", "d"), 0.3); // Maintained
  assert.strictEqual(cache.get("d", "e"), 0.4); // Stored
});

test("SimilarityCache - Invalidation after Eviction", () => {
  const cache = new SimilarityCache(2);

  cache.set("a", "b", 0.5);
  cache.set("b", "c", 0.6);
  // cache size is 2: [a:b, b:c]

  // Add 3rd entry, evicts oldest (a:b)
  cache.set("c", "d", 0.7);
  // cache size is 2: [b:c, c:d]

  assert.strictEqual(cache.get("a", "b"), undefined);

  // Invalidate 'b', which is involved in b:c. It should remove b:c
  cache.invalidate("b");
  assert.strictEqual(cache.get("b", "c"), undefined);
  assert.strictEqual(cache.get("c", "d"), 0.7); // Maintained
  assert.strictEqual(cache.size(), 1);
});

test("NanoRecommender - maxSimilarityCacheSize Validation", () => {
  // 1. Valid capacity
  const recommender = new NanoRecommender({
    maxSimilarityCacheSize: 500,
  });
  assert.ok(recommender);

  // 2. Negative capacity
  assert.throws(() => {
    new NanoRecommender({ maxSimilarityCacheSize: -100 });
  }, ValidationError);

  // 3. Zero capacity
  assert.throws(() => {
    new NanoRecommender({ maxSimilarityCacheSize: 0 });
  }, ValidationError);

  // 4. Float capacity
  assert.throws(() => {
    new NanoRecommender({ maxSimilarityCacheSize: 10.5 });
  }, ValidationError);

  // 5. Non-number capacity
  assert.throws(() => {
    new NanoRecommender({ maxSimilarityCacheSize: "invalid" as any });
  }, ValidationError);

  // 6. NaN capacity
  assert.throws(() => {
    new NanoRecommender({ maxSimilarityCacheSize: NaN });
  }, ValidationError);
});
