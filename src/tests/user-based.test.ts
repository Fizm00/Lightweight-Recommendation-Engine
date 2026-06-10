import test from "node:test";
import assert from "node:assert";
import { SparseMatrix } from "../core/matrix.js";
import { recommendFromSimilarUsers } from "../algorithms/user-based.js";
import { jaccardSimilarity } from "../algorithms/jaccard.js";

test("User-Based Recommender - Happy Path", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 5.0 },
    { userId: "u4", itemId: "i3", rating: 4.0 },
    { userId: "u4", itemId: "i4", rating: 5.0 },
  ]);

  // Recommend for u1
  const recs = recommendFromSimilarUsers(matrix, "u1");
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 2.774) < 0.01);
});

test("User-Based Recommender - excludeInteracted: false", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
  ]);

  const recs = recommendFromSimilarUsers(matrix, "u1", { excludeInteracted: false });
  assert.strictEqual(recs.length, 3);
  assert.strictEqual(recs.some(r => r.itemId === "i1"), true);
  assert.strictEqual(recs.some(r => r.itemId === "i2"), true);
  assert.strictEqual(recs.some(r => r.itemId === "i3"), true);
});

test("User-Based Recommender - similarityThreshold option", () => {
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

  // threshold 0.5 filters out u3 (sim 0.321), leaving only u2 (sim 0.923).
  // Predict rating for i3: 2.0
  const recs = recommendFromSimilarUsers(matrix, "u1", { similarityThreshold: 0.5 });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 2.0) < 1e-9);
});

test("User-Based Recommender - custom similarityFunction (Jaccard)", () => {
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

  // Using Jaccard, similarity u1-u2 is 2/3, similarity u1-u3 is 1/3.
  // Predict rating for i3: (2 * 2/3 + 5 * 1/3) / (2/3 + 1/3) = 3.0
  const recs = recommendFromSimilarUsers(matrix, "u1", { similarityFunction: jaccardSimilarity });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 3.0) < 1e-9);
});

test("User-Based Recommender - Cold Start", () => {
  const matrix = new SparseMatrix();

  // Empty matrix
  assert.deepStrictEqual(recommendFromSimilarUsers(matrix, "u1"), []);

  // Populated matrix, new user
  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 5.0 });
  assert.deepStrictEqual(recommendFromSimilarUsers(matrix, "newUser"), []);
});
