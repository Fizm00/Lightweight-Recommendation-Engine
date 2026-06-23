import { SparseMatrix } from "../core/matrix.js";
import type { GenericRecommendation, GenericRecommendationReason, SessionRecommendationOptions } from "../types/index.js";
import { recommendForUserVector } from "./item-based.js";
import { recommendContentBasedForVector } from "./content-based.js";
import type { SimilarityCache } from "../core/cache.js";
import { sortAndLimit } from "../utils/matrix-utils.js";
import { ValidationError } from "../errors/index.js";

/**
 * Recommends items based on sequential transition probabilities using a simple Markov Chain model.
 *
 * @param matrix The sparse interaction matrix.
 * @param sessionItemIds The array of item IDs in the current session (chronological order).
 * @param options Configurable options for session recommendation.
 * @returns An array of ranked recommendation objects.
 */
export function recommendSessionTransition<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  sessionItemIds: TItem[],
  options: SessionRecommendationOptions = {}
): GenericRecommendation<TItem, TUser>[] {
  const limit = options.limit ?? 10;
  const decayFactor = options.decayFactor ?? 0.5;
  const explain = options.explain ?? false;

  const N = sessionItemIds.length;
  if (N === 0) return [];

  const sessionSet = new Set(sessionItemIds);
  const candidateScores = new Map<TItem, number>();
  const triggerItemsMap = new Map<TItem, { triggerItemId: TItem; weight: number; probability: number }[]>();

  // Accumulate transition probabilities from each item in the session
  for (let j = 0; j < N; j++) {
    const fromItemId = sessionItemIds[j];
    if (fromItemId === undefined) continue;
    const weight = Math.pow(decayFactor, N - 1 - j);

    const transitionsMap = matrix.getTransitions(fromItemId);
    if (!transitionsMap || transitionsMap.size === 0) continue;

    let totalCount = 0;
    for (const count of transitionsMap.values()) {
      totalCount += count;
    }

    if (totalCount > 0) {
      for (const [toItemId, count] of transitionsMap.entries()) {
        const prob = count / totalCount;
        const scoreContribution = weight * prob;

        candidateScores.set(toItemId, (candidateScores.get(toItemId) ?? 0) + scoreContribution);

        if (explain) {
          let triggers = triggerItemsMap.get(toItemId);
          if (!triggers) {
            triggers = [];
            triggerItemsMap.set(toItemId, triggers);
          }
          triggers.push({
            triggerItemId: fromItemId,
            weight,
            probability: prob,
          });
        }
      }
    }
  }

  const recommendations: GenericRecommendation<TItem, TUser>[] = [];
  const excludeSet = options.excludeItemIds ? new Set(options.excludeItemIds as any) : null;
  const filterFn = options.filter as any;

  for (const [candidateId, score] of candidateScores.entries()) {
    // 1. Exclude items already in the session
    if (sessionSet.has(candidateId)) continue;
    if (excludeSet && excludeSet.has(candidateId)) continue;
    if (filterFn && !filterFn(candidateId)) continue;

    // 2. Filter by category if specified
    if (options.filterCategory !== undefined && matrix.getItemCategory(candidateId) !== options.filterCategory) {
      continue;
    }

    // 3. Filter by tags if specified
    if (options.filterTags !== undefined && options.filterTags.length > 0) {
      const itemTags = matrix.getItemTags(candidateId);
      if (!itemTags || !options.filterTags.some(t => itemTags.includes(t))) {
        continue;
      }
    }

    let reasons: GenericRecommendationReason<TUser, TItem>[] | undefined;
    if (explain) {
      const triggers = triggerItemsMap.get(candidateId) ?? [];
      triggers.sort((a, b) => (b.weight * b.probability) - (a.weight * a.probability));
      reasons = triggers.map(t => ({
        triggerItemId: t.triggerItemId,
        similarity: t.probability,
        explanation: `Because it frequently follows item ${String(t.triggerItemId)} in shopping patterns`,
        strategy: "session-transition",
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
 * Recommends items based on similarity to items in the active session.
 *
 * @param matrix The sparse interaction matrix.
 * @param sessionItemIds The array of item IDs in the current session (chronological order).
 * @param options Configurable options for session recommendation.
 * @param itemCache Optional cache for item-based similarity.
 * @param contentCache Optional cache for content-based similarity.
 * @returns An array of ranked recommendation objects.
 */
export function recommendSessionSimilarity<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>,
  sessionItemIds: TItem[],
  options: SessionRecommendationOptions = {},
  itemCache?: SimilarityCache,
  contentCache?: SimilarityCache
): GenericRecommendation<TItem, TUser>[] {
  const N = sessionItemIds.length;
  if (N === 0) return [];

  const decayFactor = options.decayFactor ?? 0.5;
  const similarityStrategy = options.similarityStrategy ?? "item-based";

  // Build a pseudo-user profile based on the session items with decayed weights as ratings
  const userVector = new Map<TItem, number>();
  for (let i = 0; i < N; i++) {
    const itemId = sessionItemIds[i];
    if (itemId === undefined) continue;
    const weight = Math.pow(decayFactor, N - 1 - i);
    const existingWeight = userVector.get(itemId) ?? 0;
    userVector.set(itemId, Math.max(existingWeight, weight));
  }

  let recommendations: GenericRecommendation<TItem, TUser>[];

  if (similarityStrategy === "content-based") {
    const cbOptions: any = { excludeInteracted: true };
    if (options.limit !== undefined) cbOptions.limit = options.limit;
    if (options.similarityThreshold !== undefined) cbOptions.similarityThreshold = options.similarityThreshold;
    if (options.explain !== undefined) cbOptions.explain = options.explain;
    if (options.filterCategory !== undefined) cbOptions.filterCategory = options.filterCategory;
    if (options.filterTags !== undefined) cbOptions.filterTags = options.filterTags;
    if (options.k !== undefined) cbOptions.k = options.k;
    if (options.filter !== undefined) cbOptions.filter = options.filter;
    if (options.excludeItemIds !== undefined) cbOptions.excludeItemIds = options.excludeItemIds;
    if ((options as any).categoryWeight !== undefined) cbOptions.categoryWeight = (options as any).categoryWeight;
    if ((options as any).tagWeight !== undefined) cbOptions.tagWeight = (options as any).tagWeight;

    recommendations = recommendContentBasedForVector(
      matrix,
      userVector,
      cbOptions,
      contentCache
    );
  } else if (similarityStrategy === "item-based") {
    const ibOptions: any = { excludeInteracted: true };
    if (options.limit !== undefined) ibOptions.limit = options.limit;
    if (options.similarityThreshold !== undefined) ibOptions.similarityThreshold = options.similarityThreshold;
    if (options.explain !== undefined) ibOptions.explain = options.explain;
    if (options.filterCategory !== undefined) ibOptions.filterCategory = options.filterCategory;
    if (options.filterTags !== undefined) ibOptions.filterTags = options.filterTags;
    if (options.minIntersectionSize !== undefined) ibOptions.minIntersectionSize = options.minIntersectionSize;
    if (options.k !== undefined) ibOptions.k = options.k;
    if (options.enableApproximateSearch !== undefined) ibOptions.enableApproximateSearch = options.enableApproximateSearch;
    if (options.filter !== undefined) ibOptions.filter = options.filter;
    if (options.excludeItemIds !== undefined) ibOptions.excludeItemIds = options.excludeItemIds;

    recommendations = recommendForUserVector(
      matrix,
      userVector,
      ibOptions,
      itemCache
    );
  } else {
    throw new ValidationError(`Unknown similarity strategy: ${similarityStrategy}`);
  }

  // Rewrite explanations to conform to the session-based standard if explain is true
  if (options.explain) {
    return recommendations.map(rec => {
      if (rec.reasons) {
        const reasons = rec.reasons.map(reason => ({
          ...reason,
          explanation: `Because it is similar to item ${String(reason.triggerItemId)} in your current session`,
          strategy: "session-similarity",
        }));
        return { ...rec, reasons };
      }
      return rec;
    });
  }

  return recommendations;
}
