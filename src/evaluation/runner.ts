import type { NanoRecommender, RecommendationOptions } from "../recommender.js";
import type { Interaction } from "../types/index.js";
import {
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
} from "./metrics.js";

/**
 * Configuration options for the evaluation runner.
 */
export interface EvaluationOptions {
  /** The value of K for Precision@K, Recall@K, and NDCG@K. Defaults to 10. */
  readonly topK?: number;
  /** Recommendation options passed to recommender.recommend() during evaluation. */
  readonly strategyOptions?: RecommendationOptions;
}

/**
 * Represents the results of the evaluation.
 */
export interface EvaluationResult {
  /** Root Mean Squared Error of the predicted ratings, or null if no ratings were predicted. */
  readonly rmse: number | null;
  /** Mean Absolute Error of the predicted ratings, or null if no ratings were predicted. */
  readonly mae: number | null;
  /** Mean Precision across all test users. */
  readonly precision: number;
  /** Mean Recall across all test users. */
  readonly recall: number;
  /** Mean Normalized Discounted Cumulative Gain across all test users. */
  readonly ndcg: number;
  /** Item coverage ratio (unique recommended items in Top-K / total unique items in training set). */
  readonly coverage: number;
  /** Mean Average Precision across all test users. */
  readonly map: number;
  /** Mean Reciprocal Rank across all test users. */
  readonly mrr: number;
  /** Mean Intra-List Diversity across all test users. */
  readonly diversity: number;
  /** Mean Novelty across all test users. */
  readonly novelty: number;
  /** Mean Serendipity across all test users. */
  readonly serendipity: number;
}

/**
 * Runs an offline evaluation on a recommender instance using training and testing datasets.
 * Automatically saves and restores the recommender's original state.
 *
 * @param recommender The NanoRecommender instance to evaluate.
 * @param trainData The training set of interactions.
 * @param testData The testing set of interactions.
 * @param options Configuration options for the evaluation process.
 * @returns The evaluation results.
 */
export function evaluate(
  recommender: NanoRecommender,
  trainData: Interaction[],
  testData: Interaction[],
  options: EvaluationOptions = {}
): EvaluationResult {
  const topK = options.topK ?? 10;
  if (topK <= 0) {
    throw new RangeError("topK must be a positive integer");
  }

  // 1. Export original state to restore later
  const originalState = recommender.export();

  try {
    // 2. Setup training state
    recommender.clear();
    recommender.load(trainData);

    // Group test data by user
    const userTestGroups = new Map<string, Interaction[]>();
    for (const interaction of testData) {
      let list = userTestGroups.get(interaction.userId);
      if (!list) {
        list = [];
        userTestGroups.set(interaction.userId, list);
      }
      list.push(interaction);
    }

    let totalPrecision = 0.0;
    let totalRecall = 0.0;
    let totalNDCG = 0.0;
    let totalMAP = 0.0;
    let totalMRR = 0.0;
    let totalDiversity = 0.0;
    let totalNovelty = 0.0;
    let totalSerendipity = 0.0;
    let evaluatedUsersCount = 0;

    const ratingPredictions: { actual: number; predicted: number }[] = [];
    const recommendedItemIds = new Set<string>();

    // 3. Evaluate each user in the test set
    for (const [userId, testInteractions] of userTestGroups.entries()) {
      // Skip if user does not exist in the training set (cannot recommend via CF)
      const userVector = (recommender as any).matrix.getUserVector(userId);
      if (!userVector || userVector.size === 0) {
        continue;
      }

      // Map test interactions for easy lookup
      const testItemIdsSet = new Set<string>();
      const testRatingsMap = new Map<string, number>();
      for (const inter of testInteractions) {
        testItemIdsSet.add(inter.itemId);
        testRatingsMap.set(inter.itemId, inter.rating);
      }

      // Get all recommendations (limit: Infinity to gather predictions for all items)
      const recs = recommender.recommend(userId, {
        ...options.strategyOptions,
        limit: Infinity,
        excludeInteracted: false,
      });

      const recItemIds = recs.map(r => r.itemId);

      // Track recommended items in Top-K for catalog coverage
      const topKRecs = recs.slice(0, topK);
      for (const r of topKRecs) {
        recommendedItemIds.add(r.itemId);
      }

      // Calculate ranking metrics
      const precision = calculatePrecision(recItemIds, testItemIdsSet, topK);
      const recall = calculateRecall(recItemIds, testItemIdsSet, topK);
      const ndcg = calculateNDCG(recItemIds, testItemIdsSet, topK);
      const map = calculateMAP(recItemIds, testItemIdsSet, topK);
      const mrr = calculateMRR(recItemIds, testItemIdsSet, topK);
      const diversity = calculateDiversity(recItemIds, (recommender as any).matrix, topK);
      const novelty = calculateNovelty(recItemIds, (recommender as any).matrix, topK);
      const serendipity = calculateSerendipity(recItemIds, testItemIdsSet, (recommender as any).matrix, topK);

      totalPrecision += precision;
      totalRecall += recall;
      totalNDCG += ndcg;
      totalMAP += map;
      totalMRR += mrr;
      totalDiversity += diversity;
      totalNovelty += novelty;
      totalSerendipity += serendipity;
      evaluatedUsersCount++;

      // Gather rating prediction errors
      const recsMap = new Map<string, number>();
      for (const r of recs) {
        recsMap.set(r.itemId, r.score);
      }

      for (const inter of testInteractions) {
        const predicted = recsMap.get(inter.itemId);
        if (predicted !== undefined) {
          ratingPredictions.push({
            actual: inter.rating,
            predicted: predicted,
          });
        }
      }
    }

    // 4. Calculate averages
    const meanPrecision = evaluatedUsersCount > 0 ? totalPrecision / evaluatedUsersCount : 0.0;
    const meanRecall = evaluatedUsersCount > 0 ? totalRecall / evaluatedUsersCount : 0.0;
    const meanNDCG = evaluatedUsersCount > 0 ? totalNDCG / evaluatedUsersCount : 0.0;
    const meanMAP = evaluatedUsersCount > 0 ? totalMAP / evaluatedUsersCount : 0.0;
    const meanMRR = evaluatedUsersCount > 0 ? totalMRR / evaluatedUsersCount : 0.0;
    const meanDiversity = evaluatedUsersCount > 0 ? totalDiversity / evaluatedUsersCount : 0.0;
    const meanNovelty = evaluatedUsersCount > 0 ? totalNovelty / evaluatedUsersCount : 0.0;
    const meanSerendipity = evaluatedUsersCount > 0 ? totalSerendipity / evaluatedUsersCount : 0.0;

    const rmse = calculateRMSE(ratingPredictions);
    const mae = calculateMAE(ratingPredictions);

    const totalItemsInTrainCatalog = recommender.stats().itemCount;
    const coverage = totalItemsInTrainCatalog > 0 ? recommendedItemIds.size / totalItemsInTrainCatalog : 0.0;

    return {
      rmse,
      mae,
      precision: meanPrecision,
      recall: meanRecall,
      ndcg: meanNDCG,
      coverage,
      map: meanMAP,
      mrr: meanMRR,
      diversity: meanDiversity,
      novelty: meanNovelty,
      serendipity: meanSerendipity,
    };
  } finally {
    // 5. Restore original state
    recommender.clear();
    recommender.import(originalState);
  }
}

/**
 * Compares the performance of different recommendation strategies on the same dataset.
 *
 * @param recommender The NanoRecommender instance to evaluate.
 * @param trainData The training set of interactions.
 * @param testData The testing set of interactions.
 * @param strategies Array of strategies to compare.
 * @param options Evaluation options (excluding strategyOptions, as they are overridden).
 * @returns A record mapping strategy name to its EvaluationResult.
 */
export function compareStrategies(
  recommender: NanoRecommender,
  trainData: Interaction[],
  testData: Interaction[],
  strategies: ("item-based" | "user-based" | "hybrid" | "content-based")[],
  options: Omit<EvaluationOptions, "strategyOptions"> = {}
): Record<string, EvaluationResult> {
  const results: Record<string, EvaluationResult> = {};
  for (const strategy of strategies) {
    results[strategy] = evaluate(recommender, trainData, testData, {
      ...options,
      strategyOptions: { strategy },
    });
  }
  return results;
}
