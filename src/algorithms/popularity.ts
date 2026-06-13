import { SparseMatrix } from "../core/matrix.js";
import type { Recommendation } from "../types/index.js";
import { sortAndLimit } from "../utils/matrix-utils.js";

/**
 * Retrieves the most rated items ranked by the count of users who rated them.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @param options Optional filters for item IDs.
 * @returns An array of ranked recommendation objects.
 */
export function getMostRated(
  matrix: SparseMatrix,
  limit: number,
  options: { readonly filter?: (itemId: string) => boolean; readonly excludeItemIds?: string[] } = {}
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  for (const [itemId, count] of matrix.getRatingsCountMap().entries()) {
    if (excludeSet && excludeSet.has(itemId)) continue;
    if (filterFn && !filterFn(itemId)) continue;
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}

/**
 * Retrieves the most viewed items ranked by the count of user views.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @param options Optional filters for item IDs.
 * @returns An array of ranked recommendation objects.
 */
export function getMostViewed(
  matrix: SparseMatrix,
  limit: number,
  options: { readonly filter?: (itemId: string) => boolean; readonly excludeItemIds?: string[] } = {}
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  for (const [itemId, count] of matrix.getViewsCountMap().entries()) {
    if (excludeSet && excludeSet.has(itemId)) continue;
    if (filterFn && !filterFn(itemId)) continue;
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}

/**
 * Retrieves the most purchased items ranked by the count of user purchases.
 *
 * @param matrix The sparse interaction matrix.
 * @param limit The maximum number of recommendations to return.
 * @param options Optional filters for item IDs.
 * @returns An array of ranked recommendation objects.
 */
export function getMostPurchased(
  matrix: SparseMatrix,
  limit: number,
  options: { readonly filter?: (itemId: string) => boolean; readonly excludeItemIds?: string[] } = {}
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  for (const [itemId, count] of matrix.getPurchasesCountMap().entries()) {
    if (excludeSet && excludeSet.has(itemId)) continue;
    if (filterFn && !filterFn(itemId)) continue;
    recommendations.push({ itemId, score: count });
  }
  return sortAndLimit(recommendations, limit);
}
