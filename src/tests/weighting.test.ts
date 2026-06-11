import { test } from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Recommender Weighting - Happy Path (Apply Weights)", () => {
  const recommender = new NanoRecommender({
    interactionWeights: {
      purchase: 5.0,
      view: 0.5,
      rate: 1.0,
    },
  });

  const dataset = [
    { userId: "u1", itemId: "i1", rating: 2.0, type: "purchase" }, // 2.0 * 5.0 = 10.0
    { userId: "u1", itemId: "i2", rating: 4.0, type: "view" },     // 4.0 * 0.5 = 2.0
    { userId: "u1", itemId: "i3", rating: 3.0, type: "rate" },     // 3.0 * 1.0 = 3.0
    { userId: "u2", itemId: "i1", rating: 1.5, type: "unknown" },  // 1.5 * 1.0 = 1.5
    { userId: "u2", itemId: "i2", rating: 2.5 },                  // 2.5 * 1.0 = 2.5
  ];

  recommender.load(dataset);

  const state = recommender.export();
  const storage = state.matrix.storage;

  assert.strictEqual(storage.u1?.i1, 10.0);
  assert.strictEqual(storage.u1?.i2, 2.0);
  assert.strictEqual(storage.u1?.i3, 3.0);
  assert.strictEqual(storage.u2?.i1, 1.5);
  assert.strictEqual(storage.u2?.i2, 2.5);
});

test("Recommender Weighting - Validation Errors", () => {
  // 1. Weights config is not an object
  assert.throws(() => {
    new NanoRecommender({ interactionWeights: "invalid" as any });
  }, ValidationError);

  // 2. Weight is negative
  assert.throws(() => {
    new NanoRecommender({ interactionWeights: { purchase: -1.0 } });
  }, ValidationError);

  // 3. Weight is zero
  assert.throws(() => {
    new NanoRecommender({ interactionWeights: { purchase: 0 } });
  }, ValidationError);

  // 4. Weight is NaN
  assert.throws(() => {
    new NanoRecommender({ interactionWeights: { purchase: NaN } });
  }, ValidationError);

  // 5. Weight is Infinity
  assert.throws(() => {
    new NanoRecommender({ interactionWeights: { purchase: Infinity } });
  }, ValidationError);
});
