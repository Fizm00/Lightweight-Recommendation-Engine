import test from "node:test";
import assert from "node:assert";
import { cosineSimilarity } from "../algorithms/cosine.js";
import { jaccardSimilarity } from "../algorithms/jaccard.js";

test("Similarity Engine - cosineSimilarity", () => {
  const empty = new Map<string, number>();
  const v1 = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const v2 = new Map([
    ["b", 3],
    ["c", 4],
  ]);
  const orthogonal = new Map([["c", 5]]);
  const opposite = new Map([
    ["a", -3],
    ["b", -4],
  ]);

  // Empty cases
  assert.strictEqual(cosineSimilarity(empty, v1), 0);
  assert.strictEqual(cosineSimilarity(v1, empty), 0);

  // Identical vectors (should be 1.0)
  assert.strictEqual(Math.abs(cosineSimilarity(v1, v1) - 1.0) < 1e-9, true);

  // Opposite vectors (should be -1.0)
  assert.strictEqual(Math.abs(cosineSimilarity(v1, opposite) - -1.0) < 1e-9, true);

  // Orthogonal vectors (should be 0.0)
  assert.strictEqual(cosineSimilarity(v1, orthogonal), 0);

  // Overlapping vectors (should be 12 / 25 = 0.48)
  assert.strictEqual(Math.abs(cosineSimilarity(v1, v2) - 0.48) < 1e-9, true);
});

test("Similarity Engine - jaccardSimilarity", () => {
  const empty = new Map<string, number>();
  const v1 = new Map([
    ["a", 1],
    ["b", 2],
  ]);
  const v2 = new Map([
    ["b", 3],
    ["c", 4],
  ]);
  const noOverlap = new Map([["d", 5]]);

  // Empty cases
  assert.strictEqual(jaccardSimilarity(empty, v1), 0);
  assert.strictEqual(jaccardSimilarity(v1, empty), 0);

  // Identical key sets (should be 1.0)
  assert.strictEqual(jaccardSimilarity(v1, v1), 1.0);

  // Zero overlap (should be 0.0)
  assert.strictEqual(jaccardSimilarity(v1, noOverlap), 0.0);

  // Partial overlap (intersection = {b} (1), union = {a, b, c} (3) => 1/3)
  assert.strictEqual(Math.abs(jaccardSimilarity(v1, v2) - 1 / 3) < 1e-9, true);
});
