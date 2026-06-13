import test from "node:test";
import assert from "node:assert";
import { pearsonCorrelation } from "../algorithms/pearson.js";
import { recommendForUser } from "../algorithms/item-based.js";
import { recommendFromSimilarUsers } from "../algorithms/user-based.js";
import { NanoRecommender } from "../recommender.js";
import { SparseMatrix } from "../core/matrix.js";

test("Similarity Engine - pearsonCorrelation", () => {
  const empty = new Map<string, number>();
  
  // Vector A: rating values [4, 5] (mean: 4.5, centered: [-0.5, 0.5])
  const v1 = new Map([
    ["item1", 4],
    ["item2", 5],
  ]);
  
  // Vector B: rating values [2, 3] (mean: 2.5, centered: [-0.5, 0.5])
  // Perfect positive correlation with v1
  const v2 = new Map([
    ["item1", 2],
    ["item2", 3],
  ]);

  // Vector C: rating values [3, 2] (mean: 2.5, centered: [0.5, -0.5])
  // Perfect negative correlation with v1
  const v3 = new Map([
    ["item1", 3],
    ["item2", 2],
  ]);

  // Vector D: rating values [5, 5] (mean: 5, centered: [0, 0], magnitude: 0)
  // Constant ratings - variance is 0, magnitude is 0. Should return 0.0 to avoid division by zero.
  const constant = new Map([
    ["item1", 5],
    ["item2", 5],
  ]);

  // Orthogonal items (no intersection)
  const orthogonal = new Map([
    ["item3", 4],
    ["item4", 5],
  ]);

  // 1. Empty cases
  assert.strictEqual(pearsonCorrelation(empty, v1), 0.0);
  assert.strictEqual(pearsonCorrelation(v1, empty), 0.0);

  // 2. Identical vectors (correlation should be 1.0)
  assert.strictEqual(Math.abs(pearsonCorrelation(v1, v1) - 1.0) < 1e-9, true);

  // 3. Positive correlation (should be 1.0)
  assert.strictEqual(Math.abs(pearsonCorrelation(v1, v2) - 1.0) < 1e-9, true);

  // 4. Negative correlation (should be -1.0)
  assert.strictEqual(Math.abs(pearsonCorrelation(v1, v3) - -1.0) < 1e-9, true);

  // 5. Zero magnitude/constant case (should be 0.0)
  assert.strictEqual(pearsonCorrelation(v1, constant), 0.0);
  assert.strictEqual(pearsonCorrelation(constant, v2), 0.0);

  // 6. Orthogonal (should be 0.0)
  assert.strictEqual(pearsonCorrelation(v1, orthogonal), 0.0);
});

test("Pearson integration - Item-Based Recommender with Pearson", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 2.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 1.0 },
    { userId: "u3", itemId: "i1", rating: 3.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 2.0 },
  ]);

  // Under pearsonCorrelation, i1 and i2 are perfectly correlated (sim = 1.0),
  // and both have positive similarity with i3 (sim = 0.5).
  // Let's recommend for u1 using pearsonCorrelation.
  const recs = recommendForUser(matrix, "u1", {
    similarityFunction: pearsonCorrelation,
  });

  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 4.5) < 1e-9);
});

test("Pearson integration - User-Based Recommender with Pearson", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 2.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 5.0 },
  ]);

  // u1 and u2 have perfect positive correlation of 1.0 (sim = 1.0)
  const recs = recommendFromSimilarUsers(matrix, "u1", {
    similarityFunction: pearsonCorrelation,
  });

  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.strictEqual(recs[0]?.score, 5.0);
});

test("Pearson integration - NanoRecommender with Pearson", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 2.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 1.0 },
    { userId: "u3", itemId: "i1", rating: 3.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 2.0 },
  ]);

  const recsItem = recommender.recommend("u1", {
    strategy: "item-based",
    similarityFunction: pearsonCorrelation,
  });

  assert.strictEqual(recsItem.length, 1);
  assert.strictEqual(recsItem[0]?.itemId, "i3");
  assert.ok(Math.abs((recsItem[0]?.score ?? 0) - 4.5) < 1e-9);

  // For User-Based on the same dataset:
  // u1 has ratings [4.0, 5.0] (mean: 4.5, centered: [-0.5, 0.5])
  // u2 has ratings [2.0, 3.0, 1.0] (mean: 2.0, centered: [0.0, 1.0, -1.0])
  // u3 has ratings [3.0, 4.0, 2.0] (mean: 3.0, centered: [0.0, 1.0, -1.0])
  // Both u2 and u3 have ratings for i3, and both are candidates.
  const recsUser = recommender.recommend("u1", {
    strategy: "user-based",
    similarityFunction: pearsonCorrelation,
  });

  assert.strictEqual(recsUser.length, 1);
  assert.strictEqual(recsUser[0]?.itemId, "i3");
});
