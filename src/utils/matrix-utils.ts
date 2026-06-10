import { SparseMatrix } from "../core/matrix.js";
import type { Recommendation } from "../types/index.js";

/**
 * Transposes a user-item matrix into an item-user matrix.
 *
 * @param matrix The sparse interaction matrix.
 * @returns The transposed matrix mapping item IDs to their user-rating maps.
 */
export function buildTransposeMatrix(matrix: SparseMatrix): Map<string, Map<string, number>> {
  const transpose = new Map<string, Map<string, number>>();
  for (const userId of matrix.getUserIds()) {
    const userVector = matrix.getUserVector(userId);
    if (!userVector) continue;
    for (const [itemId, rating] of userVector.entries()) {
      let itemVector = transpose.get(itemId);
      if (!itemVector) {
        itemVector = new Map<string, number>();
        transpose.set(itemId, itemVector);
      }
      itemVector.set(userId, rating);
    }
  }
  return transpose;
}

/**
 * Sorts and limits the recommendations list deterministically.
 *
 * @param recs Unsorted recommendations array.
 * @param limit The maximum number of elements.
 * @returns The sorted and sliced recommendations array.
 */
export function sortAndLimit(recs: Recommendation[], limit: number): Recommendation[] {
  return recs
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-9) {
        return b.score - a.score;
      }
      return a.itemId.localeCompare(b.itemId);
    })
    .slice(0, limit);
}
