import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError, InvalidInteractionError } from "../errors/index.js";

test("Metadata Filtering - Validation Checks", () => {
  const recommender = new NanoRecommender();

  // Invalid itemCategory in load/addInteraction
  assert.throws(() => {
    recommender.load([{ userId: "u1", itemId: "i1", rating: 5, itemCategory: 123 as any }]);
  }, InvalidInteractionError);

  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "i1", rating: 5, itemCategory: "" });
  }, InvalidInteractionError);

  // Invalid itemTags in load/addInteraction
  assert.throws(() => {
    recommender.load([{ userId: "u1", itemId: "i1", rating: 5, itemTags: "tag" as any }]);
  }, InvalidInteractionError);

  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "i1", rating: 5, itemTags: [123] as any });
  }, InvalidInteractionError);

  assert.throws(() => {
    recommender.addInteraction({ userId: "u1", itemId: "i1", rating: 5, itemTags: ["tag", ""] });
  }, InvalidInteractionError);

  // Invalid query options validation
  assert.throws(() => {
    recommender.recommend("u1", { filterCategory: 123 as any });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", { filterCategory: "" });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", { filterTags: "tag" as any });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", { filterTags: ["tag", ""] });
  }, ValidationError);
});

test("Metadata Filtering - Item-Based & User-Based CF", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    // Target user u1
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u1", itemId: "i2", rating: 4.0, itemCategory: "Movie", itemTags: ["sci-fi"] },

    // Similarity indicators
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy", "adventure"] }, // candidate Book

    { userId: "u3", itemId: "i2", rating: 4.0 },
    { userId: "u3", itemId: "i4", rating: 4.0, itemCategory: "Movie", itemTags: ["drama"] }, // candidate Movie
  ]);

  // 1. Item-Based CF: Filter Category "Book"
  const recsItemBook = recommender.recommend("u1", { strategy: "item-based", filterCategory: "Book" });
  assert.strictEqual(recsItemBook.length, 1);
  assert.strictEqual(recsItemBook[0]!.itemId, "i3");

  // 2. Item-Based CF: Filter Tags "drama"
  const recsItemDrama = recommender.recommend("u1", { strategy: "item-based", filterTags: ["drama"] });
  assert.strictEqual(recsItemDrama.length, 1);
  assert.strictEqual(recsItemDrama[0]!.itemId, "i4");

  // 3. User-Based CF: Filter Category "Movie"
  const recsUserMovie = recommender.recommend("u1", { strategy: "user-based", filterCategory: "Movie" });
  assert.strictEqual(recsUserMovie.length, 1);
  assert.strictEqual(recsUserMovie[0]!.itemId, "i4");

  // 4. User-Based CF: Filter Tags "adventure"
  const recsUserAdventure = recommender.recommend("u1", { strategy: "user-based", filterTags: ["adventure", "action"] });
  assert.strictEqual(recsUserAdventure.length, 1);
  assert.strictEqual(recsUserAdventure[0]!.itemId, "i3");
});

test("Metadata Filtering - Popularity Fallbacks", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate", itemCategory: "Book", itemTags: ["new"] },
    { userId: "u2", itemId: "i1", rating: 5.0, type: "rate" },

    { userId: "u1", itemId: "i2", rating: 5.0, type: "view", itemCategory: "Movie", itemTags: ["sci-fi"] },
    { userId: "u2", itemId: "i2", rating: 5.0, type: "view" },

    { userId: "u1", itemId: "i3", rating: 5.0, type: "purchase", itemCategory: "Book", itemTags: ["adventure"] },
    { userId: "u2", itemId: "i3", rating: 5.0, type: "purchase" },
  ]);

  // Rated Book filter
  const recsRated = recommender.recommend("uNew", { fallbackStrategy: "most-rated", filterCategory: "Book" });
  assert.strictEqual(recsRated.length, 2);
  assert.ok(recsRated.every(r => r.itemId === "i1" || r.itemId === "i3"));

  // Viewed Movie filter
  const recsViewed = recommender.recommend("uNew", { fallbackStrategy: "most-viewed", filterCategory: "Movie" });
  assert.strictEqual(recsViewed.length, 1);
  assert.strictEqual(recsViewed[0]!.itemId, "i2");

  // Purchased with Tags filter
  const recsPurchased = recommender.recommend("uNew", { fallbackStrategy: "most-purchased", filterTags: ["adventure"] });
  assert.strictEqual(recsPurchased.length, 1);
  assert.strictEqual(recsPurchased[0]!.itemId, "i3");
});

test("Metadata Filtering - Hybrid Strategy", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
    defaultHybridAlpha: 0.5,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 4.5, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i4", rating: 4.0, itemCategory: "Movie", itemTags: ["drama"] },
  ]);

  const recs = recommender.recommend("u1", { filterCategory: "Book" });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]!.itemId, "i3");
});

test("Metadata Filtering - State Serialization Persistence", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 4.5, itemCategory: "Book", itemTags: ["fantasy", "epic"] },
  ]);

  const exported = recommender.export();

  const freshRecommender = new NanoRecommender();
  freshRecommender.import(exported);

  const recs = freshRecommender.recommend("u1", { strategy: "item-based", filterCategory: "Book", filterTags: ["epic"] });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]!.itemId, "i3");
});
