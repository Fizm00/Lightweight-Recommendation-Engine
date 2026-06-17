import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";
import {
  splitRandom,
  splitTemporal,
  splitUserHoldout,
} from "../evaluation/splitter.js";
import {
  calculatePrecision,
  calculateRecall,
  calculateNDCG,
  calculateRMSE,
  calculateMAE,
} from "../evaluation/metrics.js";
import { evaluate } from "../evaluation/runner.js";

test("Dataset Splitter - splitRandom", () => {
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i3", rating: 2.0 },
    { userId: "u3", itemId: "i2", rating: 4.0 },
  ];

  assert.throws(() => splitRandom(dataset, -0.1), RangeError);
  assert.throws(() => splitRandom(dataset, 1.1), RangeError);

  const { train, test: testSet } = splitRandom(dataset, 0.6);
  assert.strictEqual(train.length + testSet.length, dataset.length);
  assert.strictEqual(train.length, 3);
  assert.strictEqual(testSet.length, 2);
});

test("Dataset Splitter - splitTemporal", () => {
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5.0, timestamp: "2026-06-01T00:00:00Z" }, // 0
    { userId: "u1", itemId: "i2", rating: 3.0, timestamp: "2026-06-05T00:00:00Z" }, // 3
    { userId: "u2", itemId: "i1", rating: 4.0, timestamp: "2026-06-03T00:00:00Z" }, // 2
    { userId: "u2", itemId: "i3", rating: 2.0, timestamp: "2026-06-02T00:00:00Z" }, // 1
    { userId: "u3", itemId: "i2", rating: 4.0, timestamp: "2026-06-06T00:00:00Z" }, // 4
  ];

  const { train, test: testSet } = splitTemporal(dataset, 0.6);
  assert.strictEqual(train.length, 3);
  assert.strictEqual(testSet.length, 2);

  // Train set should contain early items: June 1st, June 2nd, June 3rd
  const trainItemIds = train.map(i => i.itemId);
  assert.ok(trainItemIds.includes("i1")); // June 1st
  assert.ok(trainItemIds.includes("i3")); // June 2nd
  
  // Test set should contain later items: June 5th, June 6th
  const testItemIds = testSet.map(i => i.itemId);
  assert.ok(testItemIds.includes("i2")); // June 5th & 6th
});

test("Dataset Splitter - splitUserHoldout", () => {
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 3.0 },
    { userId: "u1", itemId: "i3", rating: 4.0 }, // u1 has 3 items
    { userId: "u2", itemId: "i1", rating: 4.0 },
    { userId: "u2", itemId: "i4", rating: 2.0 }, // u2 has 2 items
    { userId: "u3", itemId: "i2", rating: 5.0 }, // u3 has 1 item
  ];

  // ratio = 0.5. 
  // u1 (3 items): train gets Math.floor(3 * 0.5) = 1 (adjusted from 0? No, 1). test gets 2.
  // u2 (2 items): train gets Math.floor(2 * 0.5) = 1. test gets 1.
  // u3 (1 item): train gets Math.floor(1 * 0.5) = 0 -> adjusted to 1. test gets 0.
  const { train, test: testSet } = splitUserHoldout(dataset, 0.5);
  
  assert.strictEqual(train.length, 3); // 1 from u1, 1 from u2, 1 from u3
  assert.strictEqual(testSet.length, 3); // 2 from u1, 1 from u2, 0 from u3

  // Validate every user exists in train set
  const trainUserIds = train.map(i => i.userId);
  assert.ok(trainUserIds.includes("u1"));
  assert.ok(trainUserIds.includes("u2"));
  assert.ok(trainUserIds.includes("u3"));
});

test("Evaluation Metrics Math - Ranking Metrics", () => {
  const recommended = ["i1", "i2", "i3", "i4"];
  const testSet = new Set(["i2", "i4"]); // relevant items

  // Precision@2: Top 2 = ["i1", "i2"]. hits = 1 ("i2"). Precision = 1 / 2 = 0.5
  assert.strictEqual(calculatePrecision(recommended, testSet, 2), 0.5);

  // Recall@2: Top 2 = ["i1", "i2"]. hits = 1. Recall = 1 / 2 = 0.5
  assert.strictEqual(calculateRecall(recommended, testSet, 2), 0.5);

  // Precision@4: hits = 2 ("i2", "i4"). Precision = 2 / 4 = 0.5
  assert.strictEqual(calculatePrecision(recommended, testSet, 4), 0.5);

  // Recall@4: hits = 2. Recall = 2 / 2 = 1.0
  assert.strictEqual(calculateRecall(recommended, testSet, 4), 1.0);

  // NDCG@2: 
  // rel_1 = 0, rel_2 = 1
  // DCG@2 = 0 + 1 / log2(3) = 1 / 1.5849625 = 0.63092975
  // IDCG@2 (ideal puts hits at pos 1 and 2): 1 / log2(2) + 1 / log2(3) = 1 + 0.63092975 = 1.63092975
  // NDCG@2 = 0.63092975 / 1.63092975 = 0.3868528
  const ndcg2 = calculateNDCG(recommended, testSet, 2);
  assert.ok(Math.abs(ndcg2 - 0.3868528) < 1e-6);

});

test("Evaluation Metrics Math - Error Metrics", () => {
  const predictions = [
    { actual: 5.0, predicted: 4.0 }, // err = 1.0
    { actual: 3.0, predicted: 5.0 }, // err = -2.0
  ];

  // RMSE: sqrt((1.0^2 + (-2.0)^2) / 2) = sqrt((1 + 4) / 2) = sqrt(2.5) = 1.5811388
  const rmse = calculateRMSE(predictions);
  assert.ok(rmse !== null && Math.abs(rmse - 1.5811388) < 1e-6);

  // MAE: (abs(1.0) + abs(-2.0)) / 2 = 3.0 / 2 = 1.5
  const mae = calculateMAE(predictions);
  assert.ok(mae !== null && Math.abs(mae - 1.5) < 1e-6);

  assert.strictEqual(calculateRMSE([]), null);
  assert.strictEqual(calculateMAE([]), null);
});

test("Evaluation Runner - evaluate workflow", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  const originalDataset = [
    { userId: "uOriginal", itemId: "iOriginal", rating: 5.0 },
  ];
  recommender.load(originalDataset);

  // Training data
  const trainData = [
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 3.0 },
  ];

  // Test data
  const testData = [
    { userId: "u1", itemId: "i3", rating: 5.0 },
  ];

  // Run evaluation
  const result = evaluate(recommender, trainData, testData, {
    topK: 2,
    strategyOptions: {
      strategy: "item-based",
      similarityThreshold: 0.0,
    },
  });

  // Verify results format
  assert.ok(result.precision >= 0.0 && result.precision <= 1.0);
  assert.ok(result.recall >= 0.0 && result.recall <= 1.0);
  assert.ok(result.ndcg >= 0.0 && result.ndcg <= 1.0);
  assert.ok(result.coverage >= 0.0 && result.coverage <= 1.0);

  // Verify that the original state was successfully restored
  const stats = recommender.stats();
  assert.strictEqual(stats.userCount, 1);
  assert.strictEqual(stats.itemCount, 1);
  assert.strictEqual(recommender.recommend("uOriginal").length, 0); // Excluded since it's already interacted

  // Check invalid topK bounds
  assert.throws(() => {
    evaluate(recommender, trainData, testData, { topK: 0 });
  }, RangeError);
});
