import { SparseMatrix } from "../core/matrix.js";
import type { GenericRecommendation, GenericRecommendationReason } from "../types/index.js";
import type { SimilarityFunction } from "./similarity.js";
import { cosineSimilarity } from "./cosine.js";
import { buildTransposeMatrix, sortAndLimit } from "../utils/matrix-utils.js";
import type { SimilarityCache } from "../core/cache.js";

/**
 * Configuration options for the item-based collaborative filtering recommender.
 */
export interface ItemBasedRecommendationOptions<TItem extends string | number = string> {
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
 * Finds candidate items for a user by finding items rated by users who rated common items.
 */
function findCandidateItems<TUser extends string | number, TItem extends string | number>(
  matrix: SparseMatrix<TUser, TItem>,
  userVector: ReadonlyMap<TItem, number>,
  transpose: ReadonlyMap<TItem, ReadonlyMap<TUser, number>>,
  excludeInteracted: boolean
): Map<TItem, Set<TItem>> {
  const candidates = new Map<TItem, Set<TItem>>();
  for (const itemId of userVector.keys()) {
    const userMap = transpose.get(itemId);
    if (!userMap) continue;
    for (const userId of userMap.keys()) {
      const otherUserVector = matrix.getUserVector(userId);
      if (!otherUserVector) continue;
      for (const candidateId of otherUserVector.keys()) {
        if (!excludeInteracted || !userVector.has(candidateId)) {
          let shared = candidates.get(candidateId);
          if (!shared) {
            shared = new Set<TItem>();
            candidates.set(candidateId, shared);
          }
          shared.add(itemId);
        }
      }
    }
  }
  return candidates;
}

/**
 * Calculates the predicted score for a candidate item using weighted average.
 */
function scoreCandidate<TUser extends string | number, TItem extends string | number>(
  userVector: ReadonlyMap<TItem, number>,
  candidateId: TItem,
  transpose: ReadonlyMap<TItem, ReadonlyMap<TUser, number>>,
  similarityThreshold: number,
  simFn: SimilarityFunction,
  minIntersectionSize?: number,
  k?: number,
  cache?: SimilarityCache,
  explain?: boolean,
  sharedItems?: Set<TItem>
): { score: number; reasons?: GenericRecommendationReason<TUser, TItem>[] } | undefined {
  let weightedSum = 0;
  let similaritySum = 0;
  const candidateVector = transpose.get(candidateId);
  if (!candidateVector) return undefined;

  const neighbors: { itemId: TItem; rating: number; sim: number }[] = [];

  const itemsToLoop = sharedItems ?? userVector.keys();
  for (const itemId of itemsToLoop) {
    const rating = userVector.get(itemId)!;
    const itemVector = transpose.get(itemId);
    if (!itemVector) continue;
    let sim = cache?.get(itemId, candidateId);
    if (sim === undefined) {
      sim = simFn(itemVector, candidateVector, minIntersectionSize);
      cache?.set(itemId, candidateId, sim);
    }
    if (sim >= similarityThreshold) {
      neighbors.push({ itemId, rating, sim });
    }
  }

  if (neighbors.length === 0) {
    return undefined;
  }

  if (k !== undefined && k > 0 && neighbors.length > k) {
    neighbors.sort((a, b) => b.sim - a.sim);
    neighbors.length = k;
  } else if (explain) {
    neighbors.sort((a, b) => b.sim - a.sim);
  }

  for (const neighbor of neighbors) {
    weightedSum += neighbor.rating * neighbor.sim;
    similaritySum += neighbor.sim;
  }

  if (similaritySum <= 0) {
    return undefined;
  }

  const score = weightedSum / similaritySum;

  let reasons: GenericRecommendationReason<TUser, TItem>[] | undefined;
  if (explain) {
    reasons = neighbors.map(n => ({
      triggerItemId: n.itemId,
      similarity: n.sim,
      ratingGiven: n.rating,
      explanation: `Because you liked item ${n.itemId}`,
      strategy: "item-based",
    }));
  }

  return {
    score,
    ...(reasons ? { reasons } : {}),
  };
}

/**
 * Recommends items for a user vector (pseudo-user profile) using Item-Based Collaborative Filtering.
 */
export function recommendForUserVector<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  userVector: ReadonlyMap<TItem, number>,
  options: ItemBasedRecommendationOptions<TItem> = {},
  cache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
  if (userVector.size === 0) return [];

  const limit = options.limit ?? 10;
  const threshold = options.similarityThreshold ?? 0.0;
  const exclude = options.excludeInteracted ?? true;
  const simFn = options.similarityFunction ?? cosineSimilarity;
  const minIntersection = options.minIntersectionSize;
  const k = options.k;

  const transpose = buildTransposeMatrix(matrix);
  const candidatesMap = findCandidateItems(matrix, userVector, transpose, exclude);

  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  const filteredCandidates = new Map<TItem, Set<TItem>>();
  for (const [candidateId, sharedItems] of candidatesMap.entries()) {
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;
    if (options.filterCategory !== undefined && matrix.getItemCategory(candidateId) !== options.filterCategory) continue;
    if (options.filterTags !== undefined && options.filterTags.length > 0) {
      const itemTags = matrix.getItemTags(candidateId);
      if (!itemTags || !options.filterTags.some(t => itemTags.includes(t))) continue;
    }
    filteredCandidates.set(candidateId, sharedItems);
  }

  const recommendations: GenericRecommendation<TItem, TUser>[] = [];

  for (const [candidateId, sharedItems] of filteredCandidates.entries()) {
    const result = scoreCandidate(
      userVector,
      candidateId,
      transpose,
      threshold,
      simFn,
      minIntersection,
      k,
      cache,
      options.explain,
      sharedItems
    );
    if (result !== undefined) {
      recommendations.push({
        itemId: candidateId,
        score: result.score,
        ...(result.reasons ? { reasons: result.reasons } : {}),
      });
    }
  }

  return sortAndLimit(recommendations, limit);
}

/**
 * Recommends items for a target user using Item-Based Collaborative Filtering.
 */
export function recommendForUser<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  userId: TUser,
  options: ItemBasedRecommendationOptions<TItem> = {},
  cache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
  const userVector = matrix.getUserVector(userId);
  if (!userVector || userVector.size === 0) return [];
  return recommendForUserVector(matrix, userVector, options, cache);
}
