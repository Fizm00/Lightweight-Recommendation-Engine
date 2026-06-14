import test from "node:test";
import assert from "node:assert";
import { cosineSimilarity } from "../algorithms/cosine.js";
import { jaccardSimilarity } from "../algorithms/jaccard.js";
import { pearsonCorrelation } from "../algorithms/pearson.js";
import { SparseMatrix } from "../core/matrix.js";
import { recommendForUser } from "../algorithms/item-based.js";
import { recommendFromSimilarUsers } from "../algorithms/user-based.js";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Similarity Intersection Threshold - Mathematical Limits", () => {
  // Vector A: rates item 1 and item 2
  const vectorA = new Map([
    ["item1", 5],
    ["item2", 4],
  ]);

  // Vector B: rates item 2 and item 3
  const vectorB = new Map([
    ["item2", 4],
    ["item3", 3],
  ]);

  // Vector C: rates item 1, item 2, and item 3
  const vectorC = new Map([
    ["item1", 5],
    ["item2", 4],
    ["item3", 3],
  ]);

  // 1. Cosine Similarity
  // Vector A & B share only 1 item ("item2")
  assert.ok(cosineSimilarity(vectorA, vectorB) > 0);
  assert.strictEqual(cosineSimilarity(vectorA, vectorB, 2), 0); // Requires 2 shared items
  assert.ok(cosineSimilarity(vectorA, vectorC, 2) > 0); // Vector A & C share 2 items ("item1", "item2")

  // 2. Jaccard Similarity
  // Vector A & B share only 1 item
  assert.ok(jaccardSimilarity(vectorA, vectorB) > 0);
  assert.strictEqual(jaccardSimilarity(vectorA, vectorB, 2), 0); // Requires 2 shared items
  assert.ok(jaccardSimilarity(vectorA, vectorC, 2) > 0);

  // 3. Pearson Correlation
  // Vector A & B share only 1 item
  // Note: Pearson returns 0.0 if shared count < threshold.
  // With minIntersectionSize = 1, since they share 1 item, but magnitude of mean-centered vector is computed,
  // let's check. Wait, if there's only 1 item in common, does Pearson normally return 0.0 due to mean subtraction or lack of variance?
  // Let's verify: mean subtraction of single-item overlap has dotProduct/magnitudes.
  // Let's use vectorA and vectorC. Vector A & C share 2 items ("item1", "item2").
  // If minIntersectionSize is 2, it should pass the check. If it is 3, it should fail (0.0).
  assert.strictEqual(pearsonCorrelation(vectorA, vectorC, 3), 0.0);
});

test("Similarity Intersection Threshold - Item-Based CF Integration", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
  ]);

  // Default item-based CF (minIntersectionSize = 1)
  const recsDefault = recommendForUser(matrix, "u1", { minIntersectionSize: 1 });
  assert.strictEqual(recsDefault.length, 1);
  assert.strictEqual(recsDefault[0]?.itemId, "i3");

  // With minIntersectionSize = 2.
  // Look at i3 interactions: u2 rates (i1, i2, i3), u3 rates (i2, i3).
  // Overlap between i1 and i3: u2 rates both (size 1).
  // Overlap between i2 and i3: u2 and u3 rate both (size 2).
  // If we set minIntersectionSize to 2, similarity between i1 and i3 drops to 0.0 because they share only 1 user (u2).
  // Similarity between i2 and i3 remains because they share 2 users (u2 and u3).
  // So prediction is made purely using i2.
  const recsStrict = recommendForUser(matrix, "u1", { minIntersectionSize: 2 });
  assert.strictEqual(recsStrict.length, 1);
  assert.strictEqual(recsStrict[0]?.itemId, "i3");

  // If we set minIntersectionSize to 3, overlap size must be >= 3.
  // No items share 3 users in common.
  // Prediction for i3 should not be possible (scores undefined, so empty recommendations).
  const recsImpossible = recommendForUser(matrix, "u1", { minIntersectionSize: 3 });
  assert.strictEqual(recsImpossible.length, 0);
});

test("Similarity Intersection Threshold - User-Based CF Integration", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
  ]);

  // u1 and u2 share 2 items (i1, i2).
  // u1 and u3 share 1 item (i2).
  // If minIntersectionSize is 2, similarity between u1 and u3 becomes 0.0.
  // Similarity between u1 and u2 remains.
  // Let's verify recommendation.
  const recsDefault = recommendFromSimilarUsers(matrix, "u1", { minIntersectionSize: 1 });
  assert.strictEqual(recsDefault.length, 1);
  assert.strictEqual(recsDefault[0]?.itemId, "i3");

  // With minIntersectionSize = 2, only u2 similarity is non-zero.
  const recsStrict = recommendFromSimilarUsers(matrix, "u1", { minIntersectionSize: 2 });
  assert.strictEqual(recsStrict.length, 1);
  assert.strictEqual(recsStrict[0]?.itemId, "i3");

  // With minIntersectionSize = 3, no user shares 3 items with u1.
  const recsImpossible = recommendFromSimilarUsers(matrix, "u1", { minIntersectionSize: 3 });
  assert.strictEqual(recsImpossible.length, 0);
});

test("Similarity Intersection Threshold - Facade & Configuration", () => {
  // Check ValidationError in constructor
  assert.throws(() => {
    new NanoRecommender({ defaultMinIntersectionSize: 0 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultMinIntersectionSize: -1 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultMinIntersectionSize: 1.5 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultMinIntersectionSize: "2" as any });
  }, ValidationError);

  const recommender = new NanoRecommender({
    defaultMinIntersectionSize: 3,
    defaultStrategy: "item-based",
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

  // Uses defaultMinIntersectionSize = 3, which results in no recommendations (0.0 similarity due to low intersection)
  const recsDefault = recommender.recommend("u1");
  assert.strictEqual(recsDefault.length, 0);

  // Override option in recommend() to 1, should get recommendations
  const recsOverride = recommender.recommend("u1", { minIntersectionSize: 1 });
  assert.strictEqual(recsOverride.length, 1);
  assert.strictEqual(recsOverride[0]?.itemId, "i3");
});
