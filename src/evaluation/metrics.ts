/**
 * Calculates Precision@K for a user's recommendations.
 * Precision@K = (Relevant items in top K recommendations) / K.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param k The value of K.
 * @returns Precision score between 0.0 and 1.0.
 */
export function calculatePrecision(
  recommendedItems: string[],
  testItems: Set<string>,
  k: number
): number {
  if (k <= 0) return 0.0;
  const topK = recommendedItems.slice(0, k);
  let hits = 0;
  for (const item of topK) {
    if (testItems.has(item)) {
      hits++;
    }
  }
  return hits / k;
}

/**
 * Calculates Recall@K for a user's recommendations.
 * Recall@K = (Relevant items in top K recommendations) / (Total relevant items in test set).
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param k The value of K.
 * @returns Recall score between 0.0 and 1.0.
 */
export function calculateRecall(
  recommendedItems: string[],
  testItems: Set<string>,
  k: number
): number {
  if (testItems.size === 0) return 0.0;
  const topK = recommendedItems.slice(0, k);
  let hits = 0;
  for (const item of topK) {
    if (testItems.has(item)) {
      hits++;
    }
  }
  return hits / testItems.size;
}

/**
 * Calculates NDCG@K (Normalized Discounted Cumulative Gain) for a user's recommendations.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param k The value of K.
 * @returns NDCG score between 0.0 and 1.0.
 */
export function calculateNDCG(
  recommendedItems: string[],
  testItems: Set<string>,
  k: number
): number {
  if (k <= 0 || testItems.size === 0) return 0.0;
  const topK = recommendedItems.slice(0, k);

  let dcg = 0.0;
  for (let i = 0; i < topK.length; i++) {
    const item = topK[i]!;
    if (testItems.has(item)) {
      dcg += 1.0 / Math.log2(i + 2);
    }
  }

  let idcg = 0.0;
  const idealSize = Math.min(k, testItems.size);
  for (let i = 0; i < idealSize; i++) {
    idcg += 1.0 / Math.log2(i + 2);
  }

  return idcg > 0.0 ? dcg / idcg : 0.0;
}

/**
 * Calculates Root Mean Squared Error (RMSE) for predicted ratings.
 *
 * @param predictions List of objects containing actual and predicted ratings.
 * @returns RMSE score, or null if no predictions are provided.
 */
export function calculateRMSE(
  predictions: { actual: number; predicted: number }[]
): number | null {
  if (predictions.length === 0) return null;
  let sumSquaredError = 0.0;
  for (const p of predictions) {
    const err = p.actual - p.predicted;
    sumSquaredError += err * err;
  }
  return Math.sqrt(sumSquaredError / predictions.length);
}

/**
 * Calculates Mean Absolute Error (MAE) for predicted ratings.
 *
 * @param predictions List of objects containing actual and predicted ratings.
 * @returns MAE score, or null if no predictions are provided.
 */
export function calculateMAE(
  predictions: { actual: number; predicted: number }[]
): number | null {
  if (predictions.length === 0) return null;
  let sumAbsoluteError = 0.0;
  for (const p of predictions) {
    sumAbsoluteError += Math.abs(p.actual - p.predicted);
  }
  return sumAbsoluteError / predictions.length;
}
