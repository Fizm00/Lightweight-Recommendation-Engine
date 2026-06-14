import { SparseMatrix } from "../core/matrix.js";
import type { Recommendation } from "../types/index.js";
import type { SimilarityFunction } from "./similarity.js";
import { cosineSimilarity } from "./cosine.js";
import { buildTransposeMatrix, sortAndLimit } from "../utils/matrix-utils.js";
import type { SimilarityCache } from "../core/cache.js";

/**
 * Configuration options for the item-based collaborative filtering recommender.
 */
export interface ItemBasedRecommendationOptions {
  /** Maximum number of recommendations to return. Defaults to 10. */
  readonly limit?: number;
  /** Minimum similarity score between items to be considered. Defaults to 0.0. */
  readonly similarityThreshold?: number;
  /** Whether to exclude items the user has already interacted with. Defaults to true. */
  readonly excludeInteracted?: boolean;
  /** The similarity function to use. Defaults to cosineSimilarity. */
  readonly similarityFunction?: SimilarityFunction;
  /** Minimum number of shared items required to compute similarity. Defaults to 1. */
  readonly minIntersectionSize?: number;
  /** Optional filter function to include/exclude item IDs. */
  readonly filter?: (itemId: string) => boolean;
  /** Optional array of item IDs to exclude from recommendations. */
  readonly excludeItemIds?: string[];
}



/**
 * Finds candidate items for a user by finding items rated by users who rated common items.
 *
 * @param matrix The sparse interaction matrix.
 * @param userVector The target user's interaction map.
 * @param transpose The transposed item-user matrix.
 * @param excludeInteracted Whether to exclude target user's rated items.
 * @returns A Set of candidate item IDs.
 */
function findCandidateItems(
  matrix: SparseMatrix,
  userVector: ReadonlyMap<string, number>,
  transpose: ReadonlyMap<string, ReadonlyMap<string, number>>,
  excludeInteracted: boolean
): Set<string> {
  const candidates = new Set<string>();
  for (const itemId of userVector.keys()) {
    const userMap = transpose.get(itemId);
    if (!userMap) continue;
    for (const userId of userMap.keys()) {
      const otherUserVector = matrix.getUserVector(userId);
      if (!otherUserVector) continue;
      for (const candidateId of otherUserVector.keys()) {
        if (!excludeInteracted || !userVector.has(candidateId)) {
          candidates.add(candidateId);
        }
      }
    }
  }
  return candidates;
}

/**
 * Calculates the predicted score for a candidate item using weighted average.
 *
 * @param userVector The target user's interaction map.
 * @param candidateId The candidate item ID to predict score for.
 * @param transpose The transposed item-user matrix.
 * @param similarityThreshold The minimum similarity threshold.
 * @param simFn The similarity function to use.
 * @param cache Optional similarity cache.
 * @returns The predicted rating score, or undefined if no neighbors found.
 */
function scoreCandidate(
  userVector: ReadonlyMap<string, number>,
  candidateId: string,
  transpose: ReadonlyMap<string, ReadonlyMap<string, number>>,
  similarityThreshold: number,
  simFn: SimilarityFunction,
  minIntersectionSize?: number,
  cache?: SimilarityCache
): number | undefined {
  let weightedSum = 0;
  let similaritySum = 0;
  const candidateVector = transpose.get(candidateId);
  if (!candidateVector) return undefined;

  for (const [itemId, rating] of userVector.entries()) {
    const itemVector = transpose.get(itemId);
    if (!itemVector) continue;
    let sim = cache?.get(itemId, candidateId);
    if (sim === undefined) {
      sim = simFn(itemVector, candidateVector, minIntersectionSize);
      cache?.set(itemId, candidateId, sim);
    }
    if (sim >= similarityThreshold) {
      weightedSum += rating * sim;
      similaritySum += sim;
    }
  }

  return similaritySum > 0 ? weightedSum / similaritySum : undefined;
}



/**
 * Recommends items for a target user using Item-Based Collaborative Filtering.
 *
 * @param matrix The sparse interaction matrix.
 * @param userId The unique identifier of the target user.
 * @param options Configurable options for the recommendation process.
 * @returns An array of ranked recommendation objects.
 */
export function recommendForUser(
  matrix: SparseMatrix,
  userId: string,
  options: ItemBasedRecommendationOptions = {},
  cache?: SimilarityCache
): Recommendation[] {
  const userVector = matrix.getUserVector(userId);
  if (!userVector || userVector.size === 0) return [];

  const limit = options.limit ?? 10;
  const threshold = options.similarityThreshold ?? 0.0;
  const exclude = options.excludeInteracted ?? true;
  const simFn = options.similarityFunction ?? cosineSimilarity;
  const minIntersection = options.minIntersectionSize;

  const transpose = buildTransposeMatrix(matrix);
  const candidates = findCandidateItems(matrix, userVector, transpose, exclude);

  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  const filteredCandidates = new Set<string>();
  for (const candidateId of candidates) {
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;
    filteredCandidates.add(candidateId);
  }

  const recommendations: Recommendation[] = [];

  for (const candidateId of filteredCandidates) {
    const score = scoreCandidate(userVector, candidateId, transpose, threshold, simFn, minIntersection, cache);
    if (score !== undefined) {
      recommendations.push({ itemId: candidateId, score });
    }
  }

  return sortAndLimit(recommendations, limit);
}
