import { SparseMatrix } from "../core/matrix.js";
import type { Recommendation } from "../types/index.js";
import type { SimilarityFunction } from "./similarity.js";
import { cosineSimilarity } from "./cosine.js";
import { buildTransposeMatrix, sortAndLimit } from "../utils/matrix-utils.js";
import type { SimilarityCache } from "../core/cache.js";

/**
 * Configuration options for the user-based collaborative filtering recommender.
 */
export interface UserBasedRecommendationOptions {
  /** Maximum number of recommendations to return. Defaults to 10. */
  readonly limit?: number;
  /** Minimum similarity score between users to be considered. Defaults to 0.0. */
  readonly similarityThreshold?: number;
  /** Whether to exclude items the target user has already rated. Defaults to true. */
  readonly excludeInteracted?: boolean;
  /** The similarity function to use. Defaults to cosineSimilarity. */
  readonly similarityFunction?: SimilarityFunction;
  /** Minimum number of shared items required to compute similarity. Defaults to 1. */
  readonly minIntersectionSize?: number;
  /** Optional filter function to include/exclude item IDs. */
  readonly filter?: (itemId: string) => boolean;
  /** Optional array of item IDs to exclude from recommendations. */
  readonly excludeItemIds?: string[];
  /** Limit the similarity calculation to the top k nearest neighbors. Optional. */
  readonly k?: number | undefined;
}

/**
 * Finds all other user IDs who have rated at least one item rated by the target user.
 *
 * @param userVector The target user's interaction map.
 * @param transpose The transposed item-user matrix.
 * @param userId The unique identifier of the target user.
 * @returns A Set of similar user IDs.
 */
function findSimilarUsers(
  userVector: ReadonlyMap<string, number>,
  transpose: ReadonlyMap<string, ReadonlyMap<string, number>>,
  userId: string
): Set<string> {
  const similarUsers = new Set<string>();
  for (const itemId of userVector.keys()) {
    const userMap = transpose.get(itemId);
    if (!userMap) continue;
    for (const otherUserId of userMap.keys()) {
      if (otherUserId !== userId) {
        similarUsers.add(otherUserId);
      }
    }
  }
  return similarUsers;
}

/**
 * Computes similarity score between target user and candidate similar users.
 *
 * @param userId The target user ID.
 * @param userVector The target user's interaction map.
 * @param similarUsers A Set of candidate similar user IDs.
 * @param matrix The sparse interaction matrix.
 * @param threshold The minimum similarity threshold.
 * @param simFn The similarity function to use.
 * @param cache Optional similarity cache.
 * @returns A Map of user IDs to their similarity scores.
 */
function computeUserSimilarities(
  userId: string,
  userVector: ReadonlyMap<string, number>,
  similarUsers: Set<string>,
  matrix: SparseMatrix,
  threshold: number,
  simFn: SimilarityFunction,
  minIntersectionSize?: number,
  cache?: SimilarityCache
): Map<string, number> {
  const similarities = new Map<string, number>();
  for (const otherUserId of similarUsers) {
    const otherVector = matrix.getUserVector(otherUserId);
    if (!otherVector) continue;
    let sim = cache?.get(userId, otherUserId);
    if (sim === undefined) {
      sim = simFn(userVector, otherVector, minIntersectionSize);
      cache?.set(userId, otherUserId, sim);
    }
    if (sim >= threshold) {
      similarities.set(otherUserId, sim);
    }
  }
  return similarities;
}

/**
 * Finds all candidate items rated by similar users (that target user hasn't rated).
 *
 * @param userSimilarities Map of user IDs to similarity scores.
 * @param matrix The sparse interaction matrix.
 * @param userVector The target user's interaction map.
 * @param excludeInteracted Whether to exclude target user's rated items.
 * @returns A Set of candidate item IDs.
 */
function findCandidateItemsUB(
  userSimilarities: Map<string, number>,
  matrix: SparseMatrix,
  userVector: ReadonlyMap<string, number>,
  excludeInteracted: boolean
): Set<string> {
  const candidates = new Set<string>();
  for (const otherUserId of userSimilarities.keys()) {
    const otherVector = matrix.getUserVector(otherUserId);
    if (!otherVector) continue;
    for (const itemId of otherVector.keys()) {
      if (!excludeInteracted || !userVector.has(itemId)) {
        candidates.add(itemId);
      }
    }
  }
  return candidates;
}

/**
 * Calculates the predicted score for a candidate item based on similar users' ratings.
 *
 * @param candidateId The candidate item ID to predict score for.
 * @param transpose The transposed item-user matrix.
 * @param userSimilarities Map of user IDs to similarity scores.
 * @returns The predicted score, or undefined if similarity sum is zero.
 */
function scoreCandidateUB(
  candidateId: string,
  transpose: ReadonlyMap<string, ReadonlyMap<string, number>>,
  userSimilarities: Map<string, number>
): number | undefined {
  let weightedSum = 0;
  let similaritySum = 0;
  const userMap = transpose.get(candidateId);
  if (!userMap) return undefined;

  for (const [userId, rating] of userMap.entries()) {
    const sim = userSimilarities.get(userId);
    if (sim !== undefined) {
      weightedSum += rating * sim;
      similaritySum += sim;
    }
  }

  return similaritySum > 0 ? weightedSum / similaritySum : undefined;
}

/**
 * Scores all candidate items using similar users' ratings.
 *
 * @param candidates A Set of candidate item IDs.
 * @param transpose The transposed item-user matrix.
 * @param userSimilarities Map of user IDs to similarity scores.
 * @returns An array of recommendation objects.
 */
function scoreCandidatesUB(
  candidates: Set<string>,
  transpose: ReadonlyMap<string, ReadonlyMap<string, number>>,
  userSimilarities: Map<string, number>
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const candidateId of candidates) {
    const score = scoreCandidateUB(candidateId, transpose, userSimilarities);
    if (score !== undefined) {
      recommendations.push({ itemId: candidateId, score });
    }
  }
  return recommendations;
}

/**
 * Recommends items for a target user using User-Based Collaborative Filtering.
 *
 * @param matrix The sparse interaction matrix.
 * @param userId The unique identifier of the target user.
 * @param options Configurable options for the recommendation process.
 * @param cache Optional similarity cache to store computed user similarities.
 * @returns An array of ranked recommendation objects.
 */
export function recommendFromSimilarUsers(
  matrix: SparseMatrix,
  userId: string,
  options: UserBasedRecommendationOptions = {},
  cache?: SimilarityCache
): Recommendation[] {
  const userVector = matrix.getUserVector(userId);
  if (!userVector || userVector.size === 0) return [];

  const transpose = buildTransposeMatrix(matrix);
  const similarUsers = findSimilarUsers(userVector, transpose, userId);
  const userSimilarities = computeUserSimilarities(
    userId,
    userVector,
    similarUsers,
    matrix,
    options.similarityThreshold ?? 0.0,
    options.similarityFunction ?? cosineSimilarity,
    options.minIntersectionSize,
    cache
  );

  let activeSimilarities = userSimilarities;
  const k = options.k;
  if (k !== undefined && k > 0 && userSimilarities.size > k) {
    const sorted = Array.from(userSimilarities.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k);
    activeSimilarities = new Map(sorted);
  }

  const candidates = findCandidateItemsUB(activeSimilarities, matrix, userVector, options.excludeInteracted ?? true);

  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  const filteredCandidates = new Set<string>();
  for (const candidateId of candidates) {
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;
    filteredCandidates.add(candidateId);
  }

  const recommendations = scoreCandidatesUB(filteredCandidates, transpose, activeSimilarities);

  return sortAndLimit(recommendations, options.limit ?? 10);
}
