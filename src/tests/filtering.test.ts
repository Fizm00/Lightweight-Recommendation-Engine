import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { recommendForUser } from "../algorithms/item-based.js";
import { recommendFromSimilarUsers } from "../algorithms/user-based.js";
import { getMostRated } from "../algorithms/popularity.js";
import { SparseMatrix } from "../core/matrix.js";

test("Filtering - Item-Based CF with excludeItemIds and filter callback", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 3.0 },
    { userId: "u2", itemId: "i4", rating: 4.0 },
    { userId: "u2", itemId: "i5", rating: 5.0 },
  ]);

  // Without filtering: u1 has interacted with i1, i2. Candidates are i3, i4, i5.
  const allRecs = recommendForUser(matrix, "u1", { excludeInteracted: true });
  assert.strictEqual(allRecs.length, 3);
  assert.strictEqual(allRecs.some(r => r.itemId === "i3"), true);
  assert.strictEqual(allRecs.some(r => r.itemId === "i4"), true);
  assert.strictEqual(allRecs.some(r => r.itemId === "i5"), true);

  // With excludeItemIds (blacklist i4 and i5)
  const blacklisted = recommendForUser(matrix, "u1", {
    excludeInteracted: true,
    excludeItemIds: ["i4", "i5"],
  });
  assert.strictEqual(blacklisted.length, 1);
  assert.strictEqual(blacklisted[0]?.itemId, "i3");

  // With filter callback (only allow i4)
  const filtered = recommendForUser(matrix, "u1", {
    excludeInteracted: true,
    filter: (itemId) => itemId === "i4",
  });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0]?.itemId, "i4");

  // With both filter callback and excludeItemIds (only allow even item IDs, e.g. i4, but exclude i4 via blacklist)
  const both = recommendForUser(matrix, "u1", {
    excludeInteracted: true,
    excludeItemIds: ["i4"],
    filter: (itemId) => itemId === "i4" || itemId === "i5",
  });
  assert.strictEqual(both.length, 1);
  assert.strictEqual(both[0]?.itemId, "i5");

  // All filtered out
  const none = recommendForUser(matrix, "u1", {
    excludeInteracted: true,
    excludeItemIds: ["i3", "i4", "i5"],
  });
  assert.strictEqual(none.length, 0);
});

test("Filtering - User-Based CF with excludeItemIds and filter callback", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 3.0 },
    { userId: "u2", itemId: "i4", rating: 4.0 },
    { userId: "u2", itemId: "i5", rating: 5.0 },
  ]);

  // With excludeItemIds (blacklist i4 and i5)
  const blacklisted = recommendFromSimilarUsers(matrix, "u1", {
    excludeInteracted: true,
    excludeItemIds: ["i4", "i5"],
  });
  assert.strictEqual(blacklisted.length, 1);
  assert.strictEqual(blacklisted[0]?.itemId, "i3");

  // With filter callback (only allow i4)
  const filtered = recommendFromSimilarUsers(matrix, "u1", {
    excludeInteracted: true,
    filter: (itemId) => itemId === "i4",
  });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0]?.itemId, "i4");
});

test("Filtering - Popularity Engine (getMostRated) with filter options", () => {
  const matrix = new SparseMatrix();
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 4.0 },
  ]);

  // Without filter
  const all = getMostRated(matrix, 10);
  assert.strictEqual(all.length, 3);

  // With excludeItemIds (blacklist i1)
  const blacklisted = getMostRated(matrix, 10, { excludeItemIds: ["i1"] });
  assert.strictEqual(blacklisted.length, 2);
  assert.strictEqual(blacklisted.some(r => r.itemId === "i1"), false);

  // With filter callback (only keep i2 and i3)
  const filtered = getMostRated(matrix, 10, { filter: (itemId) => itemId !== "i1" });
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered.some(r => r.itemId === "i1"), false);
});

test("Filtering - NanoRecommender Cold Start Fallback Filtering", () => {
  const recommender = new NanoRecommender({
    defaultFallbackStrategy: "most-rated",
  });
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 4.0 },
  ]);

  // "newUser" is a cold start user. Recommend with excludeItemIds.
  const recs = recommender.recommend("newUser", {
    excludeItemIds: ["i1"],
  });

  assert.strictEqual(recs.length, 2);
  assert.strictEqual(recs.some(r => r.itemId === "i1"), false);

  // Recommend with filter callback
  const recsFilter = recommender.recommend("newUser", {
    filter: (itemId) => itemId === "i3",
  });
  assert.strictEqual(recsFilter.length, 1);
  assert.strictEqual(recsFilter[0]?.itemId, "i3");
});
