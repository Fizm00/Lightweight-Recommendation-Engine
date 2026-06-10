import test from "node:test";
import assert from "node:assert";
import { SparseMatrix } from "../core/matrix.js";
import { NanoRecommender } from "../recommender.js";
import { getMostRated, getMostViewed, getMostPurchased } from "../algorithms/popularity.js";

test("Popularity Engine - Count tracking and algorithm direct query", () => {
  const matrix = new SparseMatrix();

  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "view" },
    { userId: "u1", itemId: "i2", rating: 3.0, type: "purchase" },
    { userId: "u2", itemId: "i1", rating: 4.0, type: "view" },
    { userId: "u2", itemId: "i3", rating: 2.0, type: "purchase" },
    { userId: "u3", itemId: "i1", rating: 4.0, type: "purchase" },
  ]);

  // ratingsCount: i1: 3, i2: 1, i3: 1
  // viewsCount: i1: 2
  // purchasesCount: i2: 1, i3: 1, i1: 1

  // getMostRated
  const mostRated = getMostRated(matrix, 10);
  assert.strictEqual(mostRated.length, 3);
  assert.strictEqual(mostRated[0]?.itemId, "i1");
  assert.strictEqual(mostRated[0]?.score, 3);

  // getMostViewed
  const mostViewed = getMostViewed(matrix, 10);
  assert.strictEqual(mostViewed.length, 1);
  assert.strictEqual(mostViewed[0]?.itemId, "i1");
  assert.strictEqual(mostViewed[0]?.score, 2);

  // getMostPurchased
  const mostPurchased = getMostPurchased(matrix, 10);
  assert.strictEqual(mostPurchased.length, 3);
  assert.strictEqual(mostPurchased.some(r => r.itemId === "i1"), true);
  assert.strictEqual(mostPurchased.some(r => r.itemId === "i2"), true);
  assert.strictEqual(mostPurchased.some(r => r.itemId === "i3"), true);
});

test("Popularity Engine - Fallback routing in NanoRecommender", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "view" },
    { userId: "u1", itemId: "i2", rating: 3.0, type: "purchase" },
    { userId: "u2", itemId: "i1", rating: 4.0, type: "view" },
    { userId: "u2", itemId: "i3", rating: 2.0, type: "purchase" },
    { userId: "u3", itemId: "i1", rating: 4.0, type: "purchase" },
  ]);

  // recommend() on a cold start user (e.g. "newUser") should default to most-rated fallback
  const fallbackRated = recommender.recommend("newUser");
  assert.strictEqual(fallbackRated.length, 3);
  assert.strictEqual(fallbackRated[0]?.itemId, "i1");

  // override fallbackStrategy to most-viewed
  const fallbackViewed = recommender.recommend("newUser", { fallbackStrategy: "most-viewed" });
  assert.strictEqual(fallbackViewed.length, 1);
  assert.strictEqual(fallbackViewed[0]?.itemId, "i1");

  // disable fallback strategy ('none')
  const noFallback = recommender.recommend("newUser", { fallbackStrategy: "none" });
  assert.deepStrictEqual(noFallback, []);
});

test("Popularity Engine - Constructor fallback strategy override", () => {
  const recommender = new NanoRecommender({
    defaultFallbackStrategy: "most-purchased",
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "view" },
    { userId: "u1", itemId: "i2", rating: 3.0, type: "purchase" },
    { userId: "u2", itemId: "i1", rating: 4.0, type: "view" },
    { userId: "u2", itemId: "i3", rating: 2.0, type: "purchase" },
    { userId: "u3", itemId: "i1", rating: 4.0, type: "purchase" },
  ]);

  // Default fallback is now most-purchased
  const recs = recommender.recommend("newUser");
  assert.strictEqual(recs.length, 3);
});
