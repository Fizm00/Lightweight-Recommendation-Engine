import test from "node:test";
import assert from "node:assert";
import { SparseMatrix } from "../core/matrix.js";
import { InvalidInteractionError, ValidationError } from "../errors/index.js";

test("SparseMatrix - Initial State", () => {
  const matrix = new SparseMatrix();

  assert.strictEqual(matrix.getUserCount(), 0);
  assert.strictEqual(matrix.getItemCount(), 0);
  assert.strictEqual(matrix.getInteractionCount(), 0);
  assert.strictEqual(matrix.isEmpty(), true);
  assert.deepStrictEqual(matrix.getUserIds(), []);
  assert.deepStrictEqual(matrix.getItemIds(), []);
});

test("SparseMatrix - addInteraction and retrieves", () => {
  const matrix = new SparseMatrix();

  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 4.5 });

  assert.strictEqual(matrix.getUserCount(), 1);
  assert.strictEqual(matrix.getItemCount(), 1);
  assert.strictEqual(matrix.getInteractionCount(), 1);
  assert.strictEqual(matrix.isEmpty(), false);

  assert.strictEqual(matrix.hasUser("u1"), true);
  assert.strictEqual(matrix.hasUser("u2"), false);
  assert.strictEqual(matrix.hasItem("i1"), true);
  assert.strictEqual(matrix.hasItem("i2"), false);

  assert.strictEqual(matrix.getUserRating("u1", "i1"), 4.5);
  assert.strictEqual(matrix.getUserRating("u1", "i2"), undefined);
  assert.strictEqual(matrix.getUserRating("u2", "i1"), undefined);

  const vector = matrix.getUserVector("u1");
  assert.ok(vector);
  assert.strictEqual(vector?.get("i1"), 4.5);
});

test("SparseMatrix - Overwrite existing interaction", () => {
  const matrix = new SparseMatrix();

  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 4.5 });
  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 5.0 });

  assert.strictEqual(matrix.getUserCount(), 1);
  assert.strictEqual(matrix.getItemCount(), 1);
  assert.strictEqual(matrix.getInteractionCount(), 1); // Should not increase count
  assert.strictEqual(matrix.getUserRating("u1", "i1"), 5.0); // Should be updated
});

test("SparseMatrix - addInteractions batch", () => {
  const matrix = new SparseMatrix();

  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 3.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 5.0 },
  ]);

  assert.strictEqual(matrix.getUserCount(), 2);
  assert.strictEqual(matrix.getItemCount(), 2);
  assert.strictEqual(matrix.getInteractionCount(), 3);

  assert.deepStrictEqual(matrix.getUserIds().sort(), ["u1", "u2"]);
  assert.deepStrictEqual(matrix.getItemIds().sort(), ["i1", "i2"]);
});

test("SparseMatrix - Validation errors", () => {
  const matrix = new SparseMatrix();

  // Invalid userId
  assert.throws(() => {
    matrix.addInteraction({ userId: "", itemId: "i1", rating: 4.0 });
  }, InvalidInteractionError);

  assert.throws(() => {
    matrix.addInteraction({ userId: 123 as any, itemId: "i1", rating: 4.0 });
  }, InvalidInteractionError);

  // Invalid itemId
  assert.throws(() => {
    matrix.addInteraction({ userId: "u1", itemId: "", rating: 4.0 });
  }, InvalidInteractionError);

  // Invalid rating
  assert.throws(() => {
    matrix.addInteraction({ userId: "u1", itemId: "i1", rating: NaN });
  }, InvalidInteractionError);

  assert.throws(() => {
    matrix.addInteraction({ userId: "u1", itemId: "i1", rating: Infinity });
  }, InvalidInteractionError);

  // Null/undefined interaction
  assert.throws(() => {
    matrix.addInteraction(null as any);
  }, InvalidInteractionError);

  // Invalid interactions batch arg
  assert.throws(() => {
    matrix.addInteractions("not-an-array" as any);
  }, ValidationError);
});

test("SparseMatrix - clear and clean up", () => {
  const matrix = new SparseMatrix();

  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 4.5 });
  matrix.clear();

  assert.strictEqual(matrix.getUserCount(), 0);
  assert.strictEqual(matrix.getItemCount(), 0);
  assert.strictEqual(matrix.getInteractionCount(), 0);
  assert.strictEqual(matrix.isEmpty(), true);
  assert.strictEqual(matrix.getUserVector("u1"), undefined);
});
