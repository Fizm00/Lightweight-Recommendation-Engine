import { SparseMatrix } from "../core/matrix.js";
import type { GenericRecommendation, GenericRecommendationReason } from "../types/index.js";
import type { SimilarityFunction } from "./similarity.js";
import { cosineSimilarity } from "./cosine.js";
import { buildTransposeMatrix, sortAndLimit } from "../utils/matrix-utils.js";
import type { SimilarityCache } from "../core/cache.js";

/**
 * Configuration options for the user-based collaborative filtering recommender.
 */
export interface UserBasedRecommendationOptions<TItem extends string | number = string> {
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
  readonly filter?: (itemId: TItem) => boolean;
  /** Optional array of item IDs to exclude from recommendations. */
  readonly excludeItemIds?: TItem[];
  /** Limit the similarity calculation to the top k nearest neighbors. Optional. */
  readonly k?: number | undefined;
  /** Whether to include explanation reasons for the recommendations. Optional. */
  readonly explain?: boolean;
  /** Optional category to filter item recommendations by. */
  readonly filterCategory?: string;
  /** Optional tags to filter item recommendations by (matches items having at least one of these tags). */
  readonly filterTags?: string[];
}

/**
 * Finds all other user IDs who have rated at least one item rated by the target user.
 */
function findSimilarUsers<TUser extends string | number, TItem extends string | number>(
  userVector: ReadonlyMap<TItem, number>,
  transpose: ReadonlyMap<TItem, ReadonlyMap<TUser, number>>,
  userId: TUser
): Set<TUser> {
  const similarUsers = new Set<TUser>();
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
 */
function computeUserSimilarities<TUser extends string | number, TItem extends string | number>(
  userId: TUser,
  userVector: ReadonlyMap<TItem, number>,
  similarUsers: Set<TUser>,
  matrix: SparseMatrix<TUser, TItem>,
  threshold: number,
  simFn: SimilarityFunction,
  minIntersectionSize?: number,
  cache?: SimilarityCache
): Map<TUser, number> {
  const similarities = new Map<TUser, number>();
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
 */
function findCandidateItemsUB<TUser extends string | number, TItem extends string | number>(
  userSimilarities: Map<TUser, number>,
  matrix: SparseMatrix<TUser, TItem>,
  userVector: ReadonlyMap<TItem, number>,
  excludeInteracted: boolean
): Set<TItem> {
  const candidates = new Set<TItem>();
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
 */
function scoreCandidateUB<TUser extends string | number, TItem extends string | number>(
  candidateId: TItem,
  transpose: ReadonlyMap<TItem, ReadonlyMap<TUser, number>>,
  userSimilarities: Map<TUser, number>,
  explain?: boolean
): { score: number; reasons?: GenericRecommendationReason<TUser, TItem>[] } | undefined {
  let weightedSum = 0;
  let similaritySum = 0;
  const userMap = transpose.get(candidateId);
  if (!userMap) return undefined;

  const contributors: { userId: TUser; rating: number; sim: number }[] = [];

  for (const [userId, rating] of userMap.entries()) {
    const sim = userSimilarities.get(userId);
    if (sim !== undefined) {
      weightedSum += rating * sim;
      similaritySum += sim;
      if (explain) {
        contributors.push({ userId, rating, sim });
      }
    }
  }

  if (similaritySum <= 0) {
    return undefined;
  }

  const score = weightedSum / similaritySum;

  let reasons: GenericRecommendationReason<TUser, TItem>[] | undefined;
  if (explain) {
    reasons = contributors
      .sort((a, b) => b.sim - a.sim)
      .map(c => ({
        triggerUserId: c.userId,
        similarity: c.sim,
        ratingGiven: c.rating,
        explanation: `Because similar user ${String(c.userId)} rated it ${c.rating}`,
      }));
  }

  return {
    score,
    ...(reasons ? { reasons } : {}),
  };
}

/**
 * Scores all candidate items using similar users' ratings.
 */
function scoreCandidatesUB<TUser extends string | number, TItem extends string | number>(
  candidates: Set<TItem>,
  transpose: ReadonlyMap<TItem, ReadonlyMap<TUser, number>>,
  userSimilarities: Map<TUser, number>,
  explain?: boolean
): GenericRecommendation<TItem, TUser>[] {
  const recommendations: GenericRecommendation<TItem, TUser>[] = [];
  for (const candidateId of candidates) {
    const result = scoreCandidateUB(candidateId, transpose, userSimilarities, explain);
    if (result !== undefined) {
      recommendations.push({
        itemId: candidateId,
        score: result.score,
        ...(result.reasons ? { reasons: result.reasons } : {}),
      });
    }
  }
  return recommendations;
}

/**
 * Recommends items for a target user using User-Based Collaborative Filtering.
 */
export function recommendFromSimilarUsers<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  userId: TUser,
  options: UserBasedRecommendationOptions<TItem> = {},
  cache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
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

  const filteredCandidates = new Set<TItem>();
  for (const candidateId of candidates) {
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;
    if (options.filterCategory !== undefined && matrix.getItemCategory(candidateId) !== options.filterCategory) continue;
    if (options.filterTags !== undefined && options.filterTags.length > 0) {
      const itemTags = matrix.getItemTags(candidateId);
      if (!itemTags || !options.filterTags.some(t => itemTags.includes(t))) continue;
    }
    filteredCandidates.add(candidateId);
  }

  const recommendations = scoreCandidatesUB(filteredCandidates, transpose, activeSimilarities, options.explain);

  return sortAndLimit(recommendations, options.limit ?? 10);
}
