import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";
import { SparseMatrix } from "../core/matrix.js";
import {
  splitRandom,
  splitTemporal,
  splitUserHoldout,
  calculatePrecision,
  calculateRecall,
  calculateNDCG,
  calculateRMSE,
  calculateMAE,
  calculateMAP,
  calculateMRR,
  calculateDiversity,
  calculateNovelty,
  calculateSerendipity,
  evaluate,
  compareStrategies,
  tune,
} from "../evaluation/index.js";

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

test("Evaluation Metrics Math - Advanced Ranking & Content Metrics", () => {
  const recommended = ["i1", "i2", "i3", "i4"];
  const testSet = new Set(["i2", "i4"]); // relevant items

  // MAP@4 calculation:
  // i=0 ("i1"): not relevant.
  // i=1 ("i2"): relevant. hits = 1. precision at 2 = 1/2 = 0.5.
  // i=2 ("i3"): not relevant.
  // i=3 ("i4"): relevant. hits = 2. precision at 4 = 2/4 = 0.5.
  // sumPrecision = 0.5 + 0.5 = 1.0.
  // denominator = Math.min(4, 2) = 2.
  // MAP = 1.0 / 2 = 0.5.
  assert.strictEqual(calculateMAP(recommended, testSet, 4), 0.5);

  // MRR@4 calculation:
  // First relevant hit is "i2" at index 1 (rank 2).
  // MRR = 1/2 = 0.5.
  assert.strictEqual(calculateMRR(recommended, testSet, 4), 0.5);

  // Let's create a SparseMatrix to test Diversity, Novelty, and Serendipity.
  const matrix = new SparseMatrix<any, any>({ useIntegerMapping: true });
  // Add interactions:
  // Item "i1" has 2 interactions (u1, u2)
  // Item "i2" has 1 interaction (u1)
  // Item "i3" has 1 interaction (u2)
  // Item "i4" has 1 interaction (u3)
  matrix.addInteraction({ userId: "u1", itemId: "i1", rating: 5 });
  matrix.addInteraction({ userId: "u1", itemId: "i2", rating: 4 });
  matrix.addInteraction({ userId: "u2", itemId: "i1", rating: 4 });
  matrix.addInteraction({ userId: "u2", itemId: "i3", rating: 3 });
  matrix.addInteraction({ userId: "u3", itemId: "i4", rating: 5 });

  // Check Novelty@4:
  // total interactions = 5
  // ratingsCountMap: i1 -> 2, i2 -> 1, i3 -> 1, i4 -> 1
  // p(i1) = 2/5 = 0.4. -log2(0.4) = 1.321928
  // p(i2) = 1/5 = 0.2. -log2(0.2) = 2.321928
  // p(i3) = 1/5 = 0.2. -log2(0.2) = 2.321928
  // p(i4) = 1/5 = 0.2. -log2(0.2) = 2.321928
  // Novelty = (1.321928 + 2.321928 * 3) / 4 = (1.321928 + 6.965784) / 4 = 8.287712 / 4 = 2.071928
  const novelty = calculateNovelty(recommended, matrix, 4);
  assert.ok(Math.abs(novelty - 2.071928) < 1e-5);

  // Check Diversity@2: recommended = ["i1", "i2"]
  // Cosine similarity between i1 and i2:
  // uVecA (i1): u1 -> 5, u2 -> 4. normA = sqrt(25 + 16) = sqrt(41) = 6.403124
  // uVecB (i2): u1 -> 4. normB = sqrt(16) = 4
  // dotProduct = 5 * 4 = 20
  // similarity = 20 / (6.403124 * 4) = 20 / 25.612496 = 0.7808688
  // dissimilarity = 1 - 0.7808688 = 0.219131
  const diversity = calculateDiversity(recommended, matrix, 2);
  assert.ok(Math.abs(diversity - 0.219131) < 1e-5);

  // Check Serendipity@4: recommended = ["i1", "i2", "i3", "i4"], testSet = {"i2", "i4"}
  // ratingsCountMap maxCount = 2 (for i1)
  // For relevant items:
  // i2: count = 1. popularity = 1/2 = 0.5. serendipity contribution = max(0, 1 - 0.5) = 0.5
  // i4: count = 1. popularity = 1/2 = 0.5. serendipity contribution = max(0, 1 - 0.5) = 0.5
  // Total Serendipity = (0.5 + 0.5) / 4 = 0.25
  const serendipity = calculateSerendipity(recommended, testSet, matrix, 4);
  assert.ok(Math.abs(serendipity - 0.25) < 1e-5);
});

test("Evaluation Runner - compareStrategies", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  const trainData = [
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 3.0 },
  ];

  const testData = [
    { userId: "u1", itemId: "i3", rating: 5.0 },
  ];

  const compareResult = compareStrategies(recommender, trainData, testData, ["item-based", "user-based"], { topK: 2 });
  
  assert.ok("item-based" in compareResult);
  assert.ok("user-based" in compareResult);
  
  const itemResult = compareResult["item-based"]!;
  assert.ok(typeof itemResult.precision === "number");
  assert.ok(typeof itemResult.map === "number");
  assert.ok(typeof itemResult.diversity === "number");
});

test("Evaluation Tuner - tune workflow", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  const trainData = [
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 3.0 },
  ];

  const testData = [
    { userId: "u1", itemId: "i3", rating: 5.0 },
  ];

  const parameterGrid = {
    similarityThreshold: [0.0, 0.5],
    strategy: ["item-based", "user-based"] as ("item-based" | "user-based")[],
  };

  const tuneResult = tune(recommender, trainData, testData, parameterGrid, {
    metric: "ndcg",
    topK: 2,
  });

  assert.ok(tuneResult.trials.length === 4);
  assert.ok(tuneResult.bestParameters !== null);
  assert.ok(typeof tuneResult.bestScore === "number" || tuneResult.bestScore === null);
  
  // Verify bestParameters keys
  const bestParams = tuneResult.bestParameters!;
  assert.ok("similarityThreshold" in bestParams);
  assert.ok("strategy" in bestParams);
});
