import { SparseMatrix } from "../core/matrix.js";
import type { Recommendation } from "../types/index.js";
import { sortAndLimit } from "../utils/matrix-utils.js";

/**
 * Retrieves the most rated items ranked by the count of users who rated them.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @returns An array of ranked recommendation objects.
 */
export function getMostRated(matrix: SparseMatrix, limit: number): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const [itemId, count] of matrix.getRatingsCountMap().entries()) {
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}

/**
 * Retrieves the most viewed items ranked by the count of user views.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @returns An array of ranked recommendation objects.
 */
export function getMostViewed(matrix: SparseMatrix, limit: number): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const [itemId, count] of matrix.getViewsCountMap().entries()) {
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}

/**
 * Retrieves the most purchased items ranked by the count of user purchases.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @returns An array of ranked recommendation objects.
 */
export function getMostPurchased(matrix: SparseMatrix, limit: number): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const [itemId, count] of matrix.getPurchasesCountMap().entries()) {
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}
