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

/**
 * Calculates MAP@K (Mean Average Precision) for a user's recommendations.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param k The value of K.
 * @returns Average Precision score between 0.0 and 1.0.
 */
export function calculateMAP(
  recommendedItems: string[],
  testItems: Set<string>,
  k: number
): number {
  if (k <= 0 || testItems.size === 0) return 0.0;
  const topK = recommendedItems.slice(0, k);

  let sumPrecision = 0.0;
  let hits = 0;
  for (let i = 0; i < topK.length; i++) {
    const item = topK[i]!;
    if (testItems.has(item)) {
      hits++;
      sumPrecision += hits / (i + 1);
    }
  }

  const denominator = Math.min(k, testItems.size);
  return denominator > 0 ? sumPrecision / denominator : 0.0;
}

/**
 * Calculates MRR@K (Mean Reciprocal Rank) for a user's recommendations.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param k The value of K.
 * @returns Reciprocal Rank score between 0.0 and 1.0.
 */
export function calculateMRR(
  recommendedItems: string[],
  testItems: Set<string>,
  k: number
): number {
  if (k <= 0 || testItems.size === 0) return 0.0;
  const topK = recommendedItems.slice(0, k);

  for (let i = 0; i < topK.length; i++) {
    const item = topK[i]!;
    if (testItems.has(item)) {
      return 1.0 / (i + 1);
    }
  }
  return 0.0;
}

/**
 * Calculates collaborative cosine similarity between two item vectors.
 */
function getCollaborativeCosineSimilarity(matrix: any, itemA: any, itemB: any): number {
  if (itemA === itemB) return 1.0;
  const transpose = matrix.getTransposeMatrixRaw ? matrix.getTransposeMatrixRaw() : matrix.getTransposeMatrix();
  const uVecA = transpose.get(itemA);
  const uVecB = transpose.get(itemB);
  if (!uVecA || !uVecB) return 0.0;

  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (const [userId, ratingA] of uVecA.entries()) {
    normA += ratingA * ratingA;
    const ratingB = uVecB.get(userId);
    if (ratingB !== undefined) {
      dotProduct += ratingA * ratingB;
    }
  }
  for (const ratingB of uVecB.values()) {
    normB += ratingB * ratingB;
  }
  if (normA === 0 || normB === 0) return 0.0;
  return dotProduct / Math.sqrt(normA * normB);
}

/**
 * Calculates Intra-List Diversity@K for a list of recommended items.
 * Measures average dissimilarity (1 - cosine similarity) between all pairs of items.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param matrix The sparse interaction matrix.
 * @param k The value of K.
 * @returns Diversity score between 0.0 and 1.0.
 */
export function calculateDiversity(
  recommendedItems: string[],
  matrix: any,
  k: number
): number {
  const topK = recommendedItems.slice(0, k);
  if (topK.length <= 1) return 0.0;

  let sumDistance = 0.0;
  let pairsCount = 0;
  for (let i = 0; i < topK.length; i++) {
    const itemA = (matrix as any).lookupInternalItem ? (matrix as any).lookupInternalItem(topK[i]!) : topK[i]!;
    if (itemA === undefined) continue;
    for (let j = i + 1; j < topK.length; j++) {
      const itemB = (matrix as any).lookupInternalItem ? (matrix as any).lookupInternalItem(topK[j]!) : topK[j]!;
      if (itemB === undefined) continue;

      const sim = getCollaborativeCosineSimilarity(matrix, itemA, itemB);
      sumDistance += 1.0 - sim;
      pairsCount++;
    }
  }
  return pairsCount > 0 ? sumDistance / pairsCount : 0.0;
}

/**
 * Calculates Novelty@K (Mean Self-Information) for a list of recommended items.
 * Measures information content of items based on their global popularity in the training catalog.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param matrix The sparse interaction matrix.
 * @param k The value of K.
 * @returns Novelty score.
 */
export function calculateNovelty(
  recommendedItems: string[],
  matrix: any,
  k: number
): number {
  const topK = recommendedItems.slice(0, k);
  if (topK.length === 0) return 0.0;

  const totalInteractions = matrix.getInteractionCount();
  if (totalInteractions === 0) return 0.0;

  const ratingsCountMap = matrix.getRatingsCountMap();
  let sumSelfInformation = 0.0;
  for (const item of topK) {
    const internalItem = (matrix as any).lookupInternalItem ? (matrix as any).lookupInternalItem(item) : item;
    const count = ratingsCountMap.get(internalItem) ?? 0;
    const p = Math.max(1, count) / totalInteractions;
    sumSelfInformation += -Math.log2(p);
  }
  return sumSelfInformation / topK.length;
}

/**
 * Calculates Serendipity@K for a list of recommended items.
 * Measures the unexpectedness of relevant items in the recommendations list.
 *
 * @param recommendedItems Sorted array of recommended item IDs.
 * @param testItems Set of actual item IDs the user interacted with in the test set.
 * @param matrix The sparse interaction matrix.
 * @param k The value of K.
 * @returns Serendipity score.
 */
export function calculateSerendipity(
  recommendedItems: string[],
  testItems: Set<string>,
  matrix: any,
  k: number
): number {
  const topK = recommendedItems.slice(0, k);
  if (topK.length === 0) return 0.0;

  const ratingsCountMap = matrix.getRatingsCountMap();
  let maxCount = 0;
  for (const count of ratingsCountMap.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }
  if (maxCount === 0) return 0.0;

  let sumSerendipity = 0.0;
  for (const item of topK) {
    if (testItems.has(item)) {
      const internalItem = (matrix as any).lookupInternalItem ? (matrix as any).lookupInternalItem(item) : item;
      const count = ratingsCountMap.get(internalItem) ?? 0;
      const popularity = count / maxCount;
      sumSerendipity += Math.max(0.0, 1.0 - popularity);
    }
  }
  return sumSerendipity / topK.length;
}
