import { SparseMatrix } from "../core/matrix.js";
import type { GenericRecommendation, GenericRecommendationReason } from "../types/index.js";
import type { SimilarityCache } from "../core/cache.js";
import { sortAndLimit } from "../utils/matrix-utils.js";

/**
 * Configuration options for the content-based recommendation strategy.
 */
export interface ContentBasedRecommendationOptions<TItem extends string | number = string> {
  /** Maximum number of recommendations to return. Defaults to 10. */
  readonly limit?: number;
  /** Minimum similarity score between items to be considered. Defaults to 0.0. */
  readonly similarityThreshold?: number;
  /** Whether to exclude items the user has already interacted with. Defaults to true. */
  readonly excludeInteracted?: boolean;
  /** Weight for the category similarity component. Defaults to 0.5. */
  readonly categoryWeight?: number;
  /** Weight for the tags similarity component. Defaults to 0.5. */
  readonly tagWeight?: number;
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
 * Computes the content-based similarity between two items based on their category and tags.
 */
export function computeContentSimilarity<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  itemId1: TItem,
  itemId2: TItem,
  categoryWeight = 0.5,
  tagWeight = 0.5
): number {
  if (itemId1 === itemId2) return 1.0;

  const cat1 = matrix.getItemCategory(itemId1);
  const cat2 = matrix.getItemCategory(itemId2);
  const tags1 = matrix.getItemTags(itemId1);
  const tags2 = matrix.getItemTags(itemId2);

  const hasCat = cat1 !== undefined && cat1.trim() !== "";
  const hasTags = tags1 !== undefined && tags1.length > 0;

  const hasCatOther = cat2 !== undefined && cat2.trim() !== "";
  const hasTagsOther = tags2 !== undefined && tags2.length > 0;

  if ((!hasCat && !hasTags) || (!hasCatOther && !hasTagsOther)) {
    return 0.0;
  }

  let catSim = 0.0;
  let hasCatComparison = false;
  if (hasCat && hasCatOther) {
    catSim = cat1 === cat2 ? 1.0 : 0.0;
    hasCatComparison = true;
  }

  let tagSim = 0.0;
  let hasTagComparison = false;
  if (hasTags && hasTagsOther) {
    const set1 = new Set(tags1);
    let intersection = 0;
    for (const t of tags2!) {
      if (set1.has(t)) {
        intersection++;
      }
    }
    const union = set1.size + tags2!.length - intersection;
    tagSim = union > 0 ? intersection / union : 0.0;
    hasTagComparison = true;
  }

  if (hasCatComparison && hasTagComparison) {
    return categoryWeight * catSim + tagWeight * tagSim;
  }
  if (hasCatComparison) {
    return catSim;
  }
  if (hasTagComparison) {
    return tagSim;
  }

  return 0.0;
}

/**
 * Recommends items for a target user vector using Content-Based Filtering.
 */
export function recommendContentBasedForVector<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  userVector: ReadonlyMap<TItem, number>,
  options: ContentBasedRecommendationOptions<TItem> = {},
  cache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
  if (userVector.size === 0) return [];

  const limit = options.limit ?? 10;
  const threshold = options.similarityThreshold ?? 0.0;
  const exclude = options.excludeInteracted ?? true;
  const k = options.k;
  const explain = options.explain ?? false;

  const catWeight = options.categoryWeight ?? 0.5;
  const tagWeight = options.tagWeight ?? 0.5;

  const allItems = (matrix as any).getInternalItemIds ? (matrix as any).getInternalItemIds() : matrix.getItemIds();
  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds) : null;
  const filterFn = options.filter;

  const recommendations: GenericRecommendation<TItem, TUser>[] = [];

  for (const candidateId of allItems) {
    // 1. Filtering options
    if (exclude && userVector.has(candidateId)) continue;
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;
    if (options.filterCategory !== undefined && matrix.getItemCategory(candidateId) !== options.filterCategory) continue;
    if (options.filterTags !== undefined && options.filterTags.length > 0) {
      const itemTags = matrix.getItemTags(candidateId);
      if (!itemTags || !options.filterTags.some(t => itemTags.includes(t)) && options.filterTags.length > 0) continue;
    }

    // 2. Score candidate against user profile (interacted items)
    let weightedSum = 0;
    let similaritySum = 0;
    const neighbors: { itemId: TItem; rating: number; sim: number }[] = [];

    for (const [itemId, rating] of userVector.entries()) {
      let sim = cache?.get(itemId, candidateId);
      if (sim === undefined) {
        sim = computeContentSimilarity(matrix, itemId, candidateId, catWeight, tagWeight);
        cache?.set(itemId, candidateId, sim);
      }
      if (sim >= threshold && sim > 0) {
        neighbors.push({ itemId, rating, sim });
      }
    }

    if (neighbors.length === 0) continue;

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

    if (similaritySum <= 0) continue;

    const score = weightedSum / similaritySum;

    let reasons: GenericRecommendationReason<TUser, TItem>[] | undefined;
    if (explain) {
      reasons = neighbors.map(n => ({
        triggerItemId: n.itemId,
        similarity: n.sim,
        ratingGiven: n.rating,
        explanation: `Because you interacted with item ${String(n.itemId)} which has similar content (${(n.sim * 100).toFixed(0)}% match)`,
      }));
    }

    recommendations.push({
      itemId: candidateId,
      score,
      ...(reasons ? { reasons } : {}),
    });
  }

  return sortAndLimit(recommendations, limit);
}

/**
 * Recommends items for a target user using Content-Based Filtering.
 */
export function recommendContentBased<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  userId: TUser,
  options: ContentBasedRecommendationOptions<TItem> = {},
  cache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
  const userVector = matrix.getUserVector(userId);
  if (!userVector || userVector.size === 0) return [];
  return recommendContentBasedForVector(matrix, userVector, options, cache);
}
