import test from "node:test";
import assert from "node:assert";
import { SparseMatrix } from "../core/matrix.js";
import { recommendForUser } from "../algorithms/item-based.js";
import { recommendFromSimilarUsers } from "../algorithms/user-based.js";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("K-Nearest Neighbors - Item-Based CF Limit", () => {
  const matrix = new SparseMatrix();
  // u1 rated i1 with 5.0, i2 with 2.0.
  // We want to predict for i3.
  // Similarities:
  // Let's create profiles such that:
  // sim(i1, i3) = 0.9
  // sim(i2, i3) = 0.1
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 2.0 },
    // i1 and i3 share users u2, u3 (highly similar)
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 5.0 },
    { userId: "u3", itemId: "i1", rating: 4.0 },
    { userId: "u3", itemId: "i3", rating: 4.0 },
    // i2 and i3 share user u4 (low similarity)
    { userId: "u4", itemId: "i2", rating: 5.0 },
    { userId: "u4", itemId: "i3", rating: 1.0 },
  ]);

  // Without k limit: prediction for i3 uses both i1 (sim ~0.9) and i2 (sim ~0.1).
  // Score = (5.0 * sim(i1, i3) + 2.0 * sim(i2, i3)) / (sim(i1, i3) + sim(i2, i3))
  const recsNoLimit = recommendForUser(matrix, "u1", { similarityThreshold: 0.0 });
  assert.strictEqual(recsNoLimit.length, 1);
  const scoreNoLimit = recsNoLimit[0]?.score ?? 0;

  // With k = 1: prediction for i3 only uses the most similar item (i1, sim ~0.9).
  // Expected score = 5.0 (since only i1 is used).
  const recsLimit = recommendForUser(matrix, "u1", { similarityThreshold: 0.0, k: 1 });
  assert.strictEqual(recsLimit.length, 1);
  const scoreLimit = recsLimit[0]?.score ?? 0;
  assert.strictEqual(scoreLimit, 5.0);
  assert.notStrictEqual(scoreNoLimit, scoreLimit);
});

test("K-Nearest Neighbors - User-Based CF Limit", () => {
  const matrix = new SparseMatrix();
  // Target u1 rates i1, i2
  // u2 is highly similar to u1 (rates i1, i2 similarly), and rates i3 (rating 5.0)
  // u3 is less similar to u1 (rates i1, i2 differently), and rates i4 (rating 5.0)
  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },

    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i3", rating: 5.0 },

    { userId: "u3", itemId: "i1", rating: 1.0 },
    { userId: "u3", itemId: "i2", rating: 5.0 },
    { userId: "u3", itemId: "i4", rating: 5.0 },
  ]);

  // Without k limit, u1 gets recommendations for both i3 and i4 (from u2 and u3 respectively)
  const recsNoLimit = recommendFromSimilarUsers(matrix, "u1", { similarityThreshold: 0.0 });
  assert.strictEqual(recsNoLimit.length, 2);

  // With k = 1, only u2 (most similar user) is kept.
  // So u1 should only get a recommendation for i3 (rated by u2), not i4.
  const recsLimit = recommendFromSimilarUsers(matrix, "u1", { similarityThreshold: 0.0, k: 1 });
  assert.strictEqual(recsLimit.length, 1);
  assert.strictEqual(recsLimit[0]?.itemId, "i3");
});

test("K-Nearest Neighbors - Facade Validation & DefaultK", () => {
  // Validate constructor options
  assert.throws(() => {
    new NanoRecommender({ defaultK: 0 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultK: -5 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultK: 1.8 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultK: "10" as any });
  }, ValidationError);

  const recommender = new NanoRecommender({
    defaultK: 1,
    defaultStrategy: "user-based",
    defaultSimilarityThreshold: 0.0,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },

    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i3", rating: 5.0 },

    { userId: "u3", itemId: "i1", rating: 1.0 },
    { userId: "u3", itemId: "i2", rating: 5.0 },
    { userId: "u3", itemId: "i4", rating: 5.0 },
  ]);

  // Uses defaultK = 1, so only u2 (most similar) is considered, recommending i3
  const recsDefault = recommender.recommend("u1");
  assert.strictEqual(recsDefault.length, 1);
  assert.strictEqual(recsDefault[0]?.itemId, "i3");

  // Override option in recommend() to 2, should recommend both i3 and i4
  const recsOverride = recommender.recommend("u1", { k: 2 });
  assert.strictEqual(recsOverride.length, 2);
});
