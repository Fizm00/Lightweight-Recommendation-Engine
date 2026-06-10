import test from "node:test";
import assert from "node:assert";
import { SparseMatrix } from "../core/matrix.js";
import { recommendForUser } from "../algorithms/item-based.js";

test("Item-Based Recommender - Happy Path", () => {
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
  const recs = recommendForUser(matrix, "u1");
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 3.437) < 0.01);
});

test("Item-Based Recommender - excludeInteracted: false", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
  ]);

  const recs = recommendForUser(matrix, "u1", { excludeInteracted: false });
  // Should include i1, i2, and i3
  assert.strictEqual(recs.length, 3);
  assert.strictEqual(recs.some(r => r.itemId === "i1"), true);
  assert.strictEqual(recs.some(r => r.itemId === "i2"), true);
  assert.strictEqual(recs.some(r => r.itemId === "i3"), true);
});

test("Item-Based Recommender - similarityThreshold option", () => {
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

  // similarity between i1 and i3 is low (0.186). If threshold is 0.5, only i2 similarity is used.
  // Predict rating for i3: (3.0 * sim(i2, i3)) / sim(i2, i3) = 3.0
  const recs = recommendForUser(matrix, "u1", { similarityThreshold: 0.5 });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.ok(Math.abs((recs[0]?.score ?? 0) - 3.0) < 1e-9);
});

test("Item-Based Recommender - limit option", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
  ]);

  const recs = recommendForUser(matrix, "u1", { limit: 1 });
  assert.strictEqual(recs.length, 1);
});

test("Item-Based Recommender - Cold Start", () => {
  const matrix = new SparseMatrix();

  // Empty matrix
  assert.deepStrictEqual(recommendForUser(matrix, "u1"), []);

  // Populated matrix, new user
  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 5.0 });
  assert.deepStrictEqual(recommendForUser(matrix, "newUser"), []);
});
