import { SparseMatrix } from "./core/matrix.js";
import type { Interaction, Recommendation, RecommendationReason, RecommenderState } from "./types/index.js";
import {
  type ItemBasedRecommendationOptions,
  recommendForUser,
} from "./algorithms/item-based.js";
import {
  type UserBasedRecommendationOptions,
  recommendFromSimilarUsers,
} from "./algorithms/user-based.js";
import {
  type ContentBasedRecommendationOptions,
  recommendContentBased,
} from "./algorithms/content-based.js";
import { getMostRated, getMostViewed, getMostPurchased } from "./algorithms/popularity.js";
import { SimilarityCache } from "./core/cache.js";
import { ValidationError } from "./errors/index.js";
import { sortAndLimit } from "./utils/matrix-utils.js";


/**
 * Configuration options for the NanoRecommender engine.
 */
export interface NanoRecommenderConfig {
  /** The default strategy to use in the recommend method. Defaults to 'item-based'. */
  readonly defaultStrategy?: "item-based" | "user-based" | "hybrid" | "content-based";
  /** The default similarity threshold. Defaults to 0.0. */
  readonly defaultSimilarityThreshold?: number;
  /** The default fallback strategy for cold start users. Defaults to 'most-rated'. */
  readonly defaultFallbackStrategy?: "most-rated" | "most-viewed" | "most-purchased" | "none";
  /** Optional weights mapping interaction types to rating multipliers. */
  readonly interactionWeights?: Record<string, number>;
  /** Optional half-life in days for time-decay weighting. Must be a positive number. */
  readonly decayHalfLifeDays?: number;
  /** Optional capacity limit for similarity caches. Must be a positive integer. */
  readonly maxSimilarityCacheSize?: number;
  /** The default minimum intersection size required to compute similarity. Defaults to 1. */
  readonly defaultMinIntersectionSize?: number;
  /** The default neighborhood limit (k) to use in recommendation calculations. Optional. */
  readonly defaultK?: number;
  /** The default weighting parameter alpha for hybrid strategy. Must be between 0.0 and 1.0. Defaults to 0.5. */
  readonly defaultHybridAlpha?: number;
  /** The default explain option to include reasons in recommendation results. Optional. */
  readonly defaultExplain?: boolean;
  /** The default category weight for content-based similarity. Optional. Defaults to 0.5. */
  readonly defaultContentCategoryWeight?: number;
  /** The default tag weight for content-based similarity. Optional. Defaults to 0.5. */
  readonly defaultContentTagWeight?: number;
}

/**
 * Statistics representing the current state of the recommendation engine dataset.
 */
export interface RecommenderStats {
  /** Number of unique users in the engine database. */
  readonly userCount: number;
  /** Number of unique items in the engine database. */
  readonly itemCount: number;
  /** Total number of interactions recorded in the engine database. */
  readonly interactionCount: number;
}

/**
 * Options for the recommendation method.
 */
export interface RecommendationOptions extends ItemBasedRecommendationOptions, UserBasedRecommendationOptions, ContentBasedRecommendationOptions {
  /** The recommendation strategy to use: 'item-based' | 'user-based' | 'hybrid' | 'content-based'. */
  readonly strategy?: "item-based" | "user-based" | "hybrid" | "content-based";
  /** Fallback strategy for cold start users. Defaults to constructor default fallback strategy. */
  readonly fallbackStrategy?: "most-rated" | "most-viewed" | "most-purchased" | "none";
  /** The weighting parameter alpha for hybrid strategy on this query. Optional. */
  readonly hybridAlpha?: number | undefined;
  /** The collaborative filtering base strategy to use for hybrid recommendation. Optional. */
  readonly hybridBaseStrategy?: "item-based" | "user-based" | "content-based" | undefined;
  /** The popularity strategy to use for hybrid recommendation. Optional. */
  readonly hybridPopularityStrategy?: "most-rated" | "most-viewed" | "most-purchased" | "content-based" | undefined;
  /** Whether to include explanation reasons for the recommendations. Optional. */
  readonly explain?: boolean;
}

/**
 * The unified public entrypoint facade for the nano-recommender library.
 *
 * It manages an internal sparse interaction matrix and exposes simple APIs
 * for loading datasets and running recommendation queries without exposing internals.
 */
export class NanoRecommender {
  private readonly matrix = new SparseMatrix();
  private readonly itemCache: SimilarityCache;
  private readonly userCache: SimilarityCache;
  private readonly contentCache: SimilarityCache;
  private readonly defaultStrategy: "item-based" | "user-based" | "hybrid" | "content-based";
  private readonly defaultThreshold: number;
  private readonly defaultMinIntersectionSize: number;
  private readonly defaultK: number | undefined;
  private readonly defaultHybridAlpha: number;
  private readonly defaultExplain: boolean;
  private readonly defaultContentCategoryWeight: number;
  private readonly defaultContentTagWeight: number;
  private readonly defaultFallback: "most-rated" | "most-viewed" | "most-purchased" | "none";
  private readonly interactionWeights?: Record<string, number>;
  private readonly decayHalfLifeDays?: number;
  private lastReferenceTimeMs = Date.now();
  private lastItemMinIntersectionSize: number | undefined;
  private lastUserMinIntersectionSize: number | undefined;


  /**
   * Constructs a new NanoRecommender instance.
   *
   * @param config Optional engine configurations.
   */
  constructor(config: NanoRecommenderConfig = {}) {
    this.defaultStrategy = config.defaultStrategy ?? "item-based";
    this.defaultThreshold = config.defaultSimilarityThreshold ?? 0.0;
    this.defaultFallback = config.defaultFallbackStrategy ?? "most-rated";

    if (config.defaultExplain !== undefined && typeof config.defaultExplain !== "boolean") {
      throw new ValidationError("defaultExplain must be a boolean");
    }
    this.defaultExplain = config.defaultExplain ?? false;

    if (config.defaultMinIntersectionSize !== undefined) {
      if (
        typeof config.defaultMinIntersectionSize !== "number" ||
        Number.isNaN(config.defaultMinIntersectionSize) ||
        !Number.isFinite(config.defaultMinIntersectionSize) ||
        !Number.isInteger(config.defaultMinIntersectionSize) ||
        config.defaultMinIntersectionSize < 1
      ) {
        throw new ValidationError("defaultMinIntersectionSize must be a positive integer");
      }
    }
    this.defaultMinIntersectionSize = config.defaultMinIntersectionSize ?? 1;

    if (config.defaultK !== undefined) {
      if (
        typeof config.defaultK !== "number" ||
        Number.isNaN(config.defaultK) ||
        !Number.isFinite(config.defaultK) ||
        !Number.isInteger(config.defaultK) ||
        config.defaultK < 1
      ) {
        throw new ValidationError("defaultK must be a positive integer");
      }
      this.defaultK = config.defaultK;
    }

    if (config.defaultHybridAlpha !== undefined) {
      if (
        typeof config.defaultHybridAlpha !== "number" ||
        Number.isNaN(config.defaultHybridAlpha) ||
        !Number.isFinite(config.defaultHybridAlpha) ||
        config.defaultHybridAlpha < 0.0 ||
        config.defaultHybridAlpha > 1.0
      ) {
        throw new ValidationError("defaultHybridAlpha must be a number between 0.0 and 1.0");
      }
    }
    this.defaultHybridAlpha = config.defaultHybridAlpha ?? 0.5;

    if (config.interactionWeights) {
      if (typeof config.interactionWeights !== "object" || config.interactionWeights === null) {
        throw new ValidationError("interactionWeights must be a valid object");
      }
      for (const [type, weight] of Object.entries(config.interactionWeights)) {
        if (typeof weight !== "number" || Number.isNaN(weight) || !Number.isFinite(weight) || weight <= 0) {
          throw new ValidationError(`Weight for interaction type '${type}' must be a positive, finite number`);
        }
      }
      this.interactionWeights = config.interactionWeights;
    }

    if (config.decayHalfLifeDays !== undefined) {
      if (
        typeof config.decayHalfLifeDays !== "number" ||
        Number.isNaN(config.decayHalfLifeDays) ||
        !Number.isFinite(config.decayHalfLifeDays) ||
        config.decayHalfLifeDays <= 0
      ) {
        throw new ValidationError("decayHalfLifeDays must be a positive, finite number");
      }
      this.decayHalfLifeDays = config.decayHalfLifeDays;
    }

    let catW = config.defaultContentCategoryWeight;
    let tagW = config.defaultContentTagWeight;
    if (catW !== undefined) {
      if (typeof catW !== "number" || Number.isNaN(catW) || catW < 0.0 || catW > 1.0) {
        throw new ValidationError("defaultContentCategoryWeight must be a number between 0.0 and 1.0");
      }
    }
    if (tagW !== undefined) {
      if (typeof tagW !== "number" || Number.isNaN(tagW) || tagW < 0.0 || tagW > 1.0) {
        throw new ValidationError("defaultContentTagWeight must be a number between 0.0 and 1.0");
      }
    }
    if (catW !== undefined && tagW !== undefined) {
      if (Math.abs(catW + tagW - 1.0) > 1e-9) {
        throw new ValidationError("defaultContentCategoryWeight and defaultContentTagWeight must sum to 1.0");
      }
    } else if (catW !== undefined) {
      tagW = 1.0 - catW;
    } else if (tagW !== undefined) {
      catW = 1.0 - tagW;
    } else {
      catW = 0.5;
      tagW = 0.5;
    }
    this.defaultContentCategoryWeight = catW;
    this.defaultContentTagWeight = tagW;

    let maxCacheSize: number | undefined;
    if (config.maxSimilarityCacheSize !== undefined) {
      if (
        typeof config.maxSimilarityCacheSize !== "number" ||
        Number.isNaN(config.maxSimilarityCacheSize) ||
        !Number.isFinite(config.maxSimilarityCacheSize) ||
        !Number.isInteger(config.maxSimilarityCacheSize) ||
        config.maxSimilarityCacheSize <= 0
      ) {
        throw new ValidationError("maxSimilarityCacheSize must be a positive integer");
      }
      maxCacheSize = config.maxSimilarityCacheSize;
    }

    this.itemCache = new SimilarityCache(maxCacheSize);
    this.userCache = new SimilarityCache(maxCacheSize);
    this.contentCache = new SimilarityCache(maxCacheSize);

  }

  /**
   * Clears the current interactions and loads a new batch bulk dataset.
   *
   * @param interactions The array of interactions to load.
   * @param options Optional load configurations (e.g., custom referenceTime).
   */
  public load(
    interactions: Interaction[],
    options?: { readonly referenceTime?: number | string | Date }
  ): void {
    if (!Array.isArray(interactions)) {
      throw new ValidationError("interactions must be an array");
    }

    this.matrix.clear();

    let referenceTimeMs: number | null = null;
    if (options?.referenceTime !== undefined) {
      referenceTimeMs = new Date(options.referenceTime).getTime();
      if (Number.isNaN(referenceTimeMs) || !Number.isFinite(referenceTimeMs)) {
        throw new ValidationError(`Invalid referenceTime: ${options.referenceTime}`);
      }
    }

    const parsedTimestamps = new Map<Interaction, number>();

    if (this.decayHalfLifeDays !== undefined) {
      let maxTime = 0;
      for (const interaction of interactions) {
        if (interaction?.timestamp !== undefined) {
          const t = new Date(interaction.timestamp).getTime();
          if (Number.isNaN(t) || !Number.isFinite(t)) {
            throw new ValidationError(`Invalid timestamp in interaction: ${interaction.timestamp}`);
          }
          parsedTimestamps.set(interaction, t);
          if (t > maxTime) {
            maxTime = t;
          }
        }
      }

      if (referenceTimeMs === null) {
        referenceTimeMs = maxTime > 0 ? maxTime : Date.now();
      }
    }

    if (referenceTimeMs === null) {
      referenceTimeMs = Date.now();
    }
    this.lastReferenceTimeMs = referenceTimeMs;

    const processedInteractions = interactions.map(interaction => {
      if (!interaction) {
        return interaction;
      }

      let rating = interaction.rating;
      const type = interaction.type;

      if (type && this.interactionWeights && this.interactionWeights[type] !== undefined) {
        rating *= this.interactionWeights[type];
      }

      if (this.decayHalfLifeDays !== undefined && interaction.timestamp !== undefined && referenceTimeMs !== null) {
        const interactionTimeMs = parsedTimestamps.get(interaction)!;
        const elapsedMs = Math.max(0, referenceTimeMs - interactionTimeMs);
        const halfLifeMs = this.decayHalfLifeDays * 24 * 60 * 60 * 1000;
        const decayFactor = Math.pow(0.5, elapsedMs / halfLifeMs);
        rating *= decayFactor;
      }

      return {
        ...interaction,
        rating,
      };
    });

    this.matrix.addInteractions(processedInteractions);
    this.itemCache.clear();
    this.userCache.clear();
    this.contentCache.clear();
    this.lastItemMinIntersectionSize = undefined;
    this.lastUserMinIntersectionSize = undefined;
  }

  /**
   * Adds a single user-item interaction in real-time.
   * Automatically processes the interaction's weight, applies time-decay relative
   * to the last reference time, updates the sparse matrix, and invalidates the
   * similarity cache for the affected user and item.
   *
   * @param interaction The interaction object to add or update.
   */
  public addInteraction(interaction: Interaction): void {
    if (!interaction) {
      throw new ValidationError("Interaction cannot be null or undefined");
    }

    const { userId, itemId, rating, type, timestamp } = interaction;
    if (typeof userId !== "string" || userId.trim() === "") {
      throw new ValidationError("userId must be a non-empty string");
    }
    if (typeof itemId !== "string" || itemId.trim() === "") {
      throw new ValidationError("itemId must be a non-empty string");
    }
    if (typeof rating !== "number" || Number.isNaN(rating) || !Number.isFinite(rating)) {
      throw new ValidationError("rating must be a finite number");
    }
    if (type !== undefined && (typeof type !== "string" || type.trim() === "")) {
      throw new ValidationError("type must be a non-empty string if provided");
    }

    let processedRating = rating;

    // 1. Apply interaction weight if configured
    if (type && this.interactionWeights && this.interactionWeights[type] !== undefined) {
      processedRating *= this.interactionWeights[type];
    }

    // 2. Apply time-decay if configured and timestamp is present
    if (this.decayHalfLifeDays !== undefined && timestamp !== undefined) {
      const interactionTimeMs = new Date(timestamp).getTime();
      if (Number.isNaN(interactionTimeMs) || !Number.isFinite(interactionTimeMs)) {
        throw new ValidationError(`Invalid timestamp in interaction: ${timestamp}`);
      }
      const elapsedMs = Math.max(0, this.lastReferenceTimeMs - interactionTimeMs);
      const halfLifeMs = this.decayHalfLifeDays * 24 * 60 * 60 * 1000;
      const decayFactor = Math.pow(0.5, elapsedMs / halfLifeMs);
      processedRating *= decayFactor;
    }

    // 3. Add to matrix
    this.matrix.addInteraction({
      ...interaction,
      rating: processedRating,
    });

    // 4. Invalidate specific cache entries
    this.itemCache.invalidate(itemId);
    this.userCache.invalidate(userId);
    this.contentCache.invalidate(itemId);
  }

  /**
   * Generates item recommendations for a user based on the selected strategy.
   *
   * @param userId The unique identifier of the target user.
   * @param options Configurable options for the recommendation process.
   * @returns An array of ranked recommendation objects.
   */
  public recommend(userId: string, options: RecommendationOptions = {}): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);
    const userVector = this.matrix.getUserVector(userId);
    const limit = options.limit ?? 10;
    const explain = options.explain ?? this.defaultExplain;
    const combinedOptions = { ...options, explain };

    if (!userVector || userVector.size === 0) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit, combinedOptions);
    }

    const strategy = options.strategy ?? this.defaultStrategy;
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const finalOptions = { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, ...combinedOptions };

    if (strategy === "hybrid") {
      return this.recommendHybrid(userId, finalOptions);
    }
    if (strategy === "user-based") {
      return this.recommendUserBased(userId, finalOptions);
    }
    if (strategy === "content-based") {
      return this.recommendContentBased(userId, finalOptions);
    }
    return this.recommendItemBased(userId, finalOptions);
  }


  /**
   * Generates recommendations using a Hybrid Strategy combining CF and Popularity scores.
   *
   * @param userId The unique identifier of the target user.
   * @param options Recommendation options containing hybrid strategy configs.
   * @returns An array of ranked recommendation objects.
   */
  public recommendHybrid(
    userId: string,
    options: RecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);
    const limit = options.limit ?? 10;
    const explain = options.explain ?? this.defaultExplain;

    const alpha = options.hybridAlpha ?? this.defaultHybridAlpha;
    if (typeof alpha !== "number" || Number.isNaN(alpha) || !Number.isFinite(alpha) || alpha < 0.0 || alpha > 1.0) {
      throw new ValidationError("hybridAlpha must be a number between 0.0 and 1.0");
    }

    const baseStrategy = options.hybridBaseStrategy ??
      (this.defaultStrategy === "hybrid" ? "item-based" : this.defaultStrategy);

    const popStrategy = options.hybridPopularityStrategy ??
      (this.defaultFallback === "none" ? "most-rated" : this.defaultFallback as any);

    if (popStrategy === "content-based") {
      // 1. Get base strategy recommendations
      const baseRecs = baseStrategy === "user-based"
        ? this.recommendUserBased(userId, { ...options, limit: Infinity, explain })
        : baseStrategy === "content-based"
        ? this.recommendContentBased(userId, { ...options, limit: Infinity, explain })
        : this.recommendItemBased(userId, { ...options, limit: Infinity, explain });

      // 2. Get secondary content-based recommendations
      const cbRecs = this.recommendContentBased(userId, { ...options, limit: Infinity, explain });

      // Handle cold start if both lists are empty
      if (baseRecs.length === 0 && cbRecs.length === 0) {
        return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit, { ...options, explain });
      }

      // Map item IDs to their recommendation objects for fast lookup
      const baseMap = new Map<string, Recommendation>();
      let minBase = Infinity;
      let maxBase = -Infinity;
      for (const rec of baseRecs) {
        baseMap.set(rec.itemId, rec);
        if (rec.score < minBase) minBase = rec.score;
        if (rec.score > maxBase) maxBase = rec.score;
      }
      if (baseRecs.length === 0) {
        minBase = 0.0;
        maxBase = 0.0;
      }

      const cbMap = new Map<string, Recommendation>();
      let minCb = Infinity;
      let maxCb = -Infinity;
      for (const rec of cbRecs) {
        cbMap.set(rec.itemId, rec);
        if (rec.score < minCb) minCb = rec.score;
        if (rec.score > maxCb) maxCb = rec.score;
      }
      if (cbRecs.length === 0) {
        minCb = 0.0;
        maxCb = 0.0;
      }

      // Gather all unique item IDs
      const allItemIds = new Set<string>([...baseMap.keys(), ...cbMap.keys()]);
      const hybridRecs: Recommendation[] = [];

      for (const itemId of allItemIds) {
        const baseRec = baseMap.get(itemId);
        const cbRec = cbMap.get(itemId);

        const baseScore = baseRec ? baseRec.score : 0.0;
        const cbScore = cbRec ? cbRec.score : 0.0;

        let normBase = 0.0;
        if (baseRec) {
          normBase = maxBase === minBase ? 1.0 : (baseScore - minBase) / (maxBase - minBase);
        }

        let normCb = 0.0;
        if (cbRec) {
          normCb = maxCb === minCb ? 1.0 : (cbScore - minCb) / (maxCb - minCb);
        }

        const blendedScore = alpha * normBase + (1.0 - alpha) * normCb;
        if (blendedScore <= 0.0) {
          continue;
        }

        let reasons: RecommendationReason[] | undefined;
        if (explain) {
          const baseReasons = baseRec?.reasons ?? [];
          const cbReasons = cbRec?.reasons ?? [];
          
          const combinedReasons = [...baseReasons, ...cbReasons];
          if (combinedReasons.length > 0) {
            combinedReasons.sort((a, b) => b.similarity - a.similarity);
            reasons = combinedReasons;
          }
        }

        hybridRecs.push({
          itemId,
          score: blendedScore,
          ...(reasons ? { reasons } : {}),
        });
      }

      return sortAndLimit(hybridRecs, limit);
    } else {
      // Get all collaborative/base filtering candidates (limit: Infinity)
      const cfOptions = { ...options, limit: Infinity, explain };
      const cfRecs = baseStrategy === "user-based"
        ? this.recommendUserBased(userId, cfOptions)
        : baseStrategy === "content-based"
        ? this.recommendContentBased(userId, cfOptions)
        : this.recommendItemBased(userId, cfOptions);

      if (cfRecs.length === 0) {
        return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit, { ...options, explain });
      }

      let popMap: ReadonlyMap<string, number>;
      if (popStrategy === "most-viewed") {
        popMap = this.matrix.getViewsCountMap();
      } else if (popStrategy === "most-purchased") {
        popMap = this.matrix.getPurchasesCountMap();
      } else {
        popMap = this.matrix.getRatingsCountMap();
      }

      // Gather scores for Min-Max Normalization
      let minCf = Infinity;
      let maxCf = -Infinity;
      let minPop = Infinity;
      let maxPop = -Infinity;

      const itemsData = cfRecs.map(rec => {
        const cfScore = rec.score;
        const popScore = popMap.get(rec.itemId) ?? 0;
        const reasons = rec.reasons;

        if (cfScore < minCf) minCf = cfScore;
        if (cfScore > maxCf) maxCf = cfScore;
        if (popScore < minPop) minPop = popScore;
        if (popScore > maxPop) maxPop = popScore;

        return { itemId: rec.itemId, cfScore, popScore, reasons };
      });

      // Compute blended hybrid scores
      const hybridRecs: Recommendation[] = itemsData.map(item => {
        const normCf = maxCf === minCf ? 1.0 : (item.cfScore - minCf) / (maxCf - minCf);
        const normPop = maxPop === minPop ? 1.0 : (item.popScore - minPop) / (maxPop - minPop);

        const blendedScore = alpha * normCf + (1.0 - alpha) * normPop;
        return {
          itemId: item.itemId,
          score: blendedScore,
          ...(item.reasons ? { reasons: item.reasons } : {}),
        };
      });

      return sortAndLimit(hybridRecs, limit);
    }
  }

  /**
   * Handles recommendation for cold-start users.
   */
  private handleColdStart(
    strategy: "most-rated" | "most-viewed" | "most-purchased" | "none",
    limit: number,
    options: RecommendationOptions = {}
  ): Recommendation[] {
    if (strategy === "most-viewed") {
      return getMostViewed(this.matrix, limit, options);
    }
    if (strategy === "most-purchased") {
      return getMostPurchased(this.matrix, limit, options);
    }
    if (strategy === "most-rated") {
      return getMostRated(this.matrix, limit, options);
    }
    return [];
  }

  /**
   * Generates recommendations using Item-Based Collaborative Filtering.
   *
   * @param userId The unique identifier of the target user.
   * @param options Item-based recommendation options.
   * @returns An array of ranked recommendation objects.
   */
  public recommendItemBased(
    userId: string,
    options: ItemBasedRecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const explain = options.explain ?? this.defaultExplain;
    if (this.lastItemMinIntersectionSize !== undefined && this.lastItemMinIntersectionSize !== minIntersection) {
      this.itemCache.clear();
    }
    this.lastItemMinIntersectionSize = minIntersection;
    return recommendForUser(
      this.matrix,
      userId,
      { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, explain, ...options },
      this.itemCache
    );
  }

  /**
   * Generates recommendations using User-Based Collaborative Filtering.
   *
   * @param userId The unique identifier of the target user.
   * @param options User-based recommendation options.
   * @returns An array of ranked recommendation objects.
   */
  public recommendUserBased(
    userId: string,
    options: UserBasedRecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const explain = options.explain ?? this.defaultExplain;
    if (this.lastUserMinIntersectionSize !== undefined && this.lastUserMinIntersectionSize !== minIntersection) {
      this.userCache.clear();
    }
    this.lastUserMinIntersectionSize = minIntersection;
    return recommendFromSimilarUsers(
      this.matrix,
      userId,
      { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, explain, ...options },
      this.userCache
    );
  }

  /**
   * Generates recommendations using Content-Based Filtering.
   *
   * @param userId The unique identifier of the target user.
   * @param options Content-based recommendation options.
   * @returns An array of ranked recommendation objects.
   */
  public recommendContentBased(
    userId: string,
    options: ContentBasedRecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);

    let catW = options.categoryWeight;
    let tagW = options.tagWeight;
    if (catW !== undefined) {
      if (typeof catW !== "number" || Number.isNaN(catW) || catW < 0.0 || catW > 1.0) {
        throw new ValidationError("categoryWeight must be a number between 0.0 and 1.0");
      }
    }
    if (tagW !== undefined) {
      if (typeof tagW !== "number" || Number.isNaN(tagW) || tagW < 0.0 || tagW > 1.0) {
        throw new ValidationError("tagWeight must be a number between 0.0 and 1.0");
      }
    }
    if (catW !== undefined && tagW !== undefined) {
      if (Math.abs(catW + tagW - 1.0) > 1e-9) {
        throw new ValidationError("categoryWeight and tagWeight must sum to 1.0");
      }
    } else if (catW !== undefined) {
      tagW = 1.0 - catW;
    } else if (tagW !== undefined) {
      catW = 1.0 - tagW;
    } else {
      catW = this.defaultContentCategoryWeight;
      tagW = this.defaultContentTagWeight;
    }

    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const k = options.k ?? this.defaultK;
    const explain = options.explain ?? this.defaultExplain;

    return recommendContentBased(
      this.matrix,
      userId,
      {
        similarityThreshold: threshold,
        k,
        explain,
        categoryWeight: catW,
        tagWeight: tagW,
        ...options,
      },
      this.contentCache
    );
  }

  /**
   * Clears all interactions and internal datasets from the engine.
   */
  public clear(): void {
    this.matrix.clear();
    this.itemCache.clear();
    this.userCache.clear();
    this.contentCache.clear();
    this.lastItemMinIntersectionSize = undefined;
    this.lastUserMinIntersectionSize = undefined;
  }

  /**
   * Retrieves summary statistics of the loaded dataset.
   *
   * @returns An object containing user, item, and interaction counts.
   */
  public stats(): RecommenderStats {
    return {
      userCount: this.matrix.getUserCount(),
      itemCount: this.matrix.getItemCount(),
      interactionCount: this.matrix.getInteractionCount(),
    };
  }

  /**
   * Exports the entire internal state of the recommender engine.
   *
   * @returns The serialized RecommenderState object.
   */
  public export(): RecommenderState {
    return {
      version: "1",
      matrix: this.matrix.exportState(),
    };
  }

  /**
   * Restores the recommender engine state from a serialized state.
   * Invalidates internal similarity caches.
   *
   * @param state The serialized RecommenderState to import.
   * @throws {ValidationError} If the state version is unsupported or payload is invalid.
   */
  public import(state: RecommenderState): void {
    if (!state) {
      throw new ValidationError("RecommenderState cannot be null or undefined");
    }

    if (state.version !== "1") {
      throw new ValidationError(`Unsupported recommender state version: ${state.version}`);
    }

    if (!state.matrix) {
      throw new ValidationError("RecommenderState is missing matrix payload");
    }

    this.matrix.importState(state.matrix);
    this.itemCache.clear();
    this.userCache.clear();
    this.contentCache.clear();
    this.lastReferenceTimeMs = Date.now();
    this.lastItemMinIntersectionSize = undefined;
    this.lastUserMinIntersectionSize = undefined;
  }

  private validateFilteringOptions(options: { readonly filterCategory?: string; readonly filterTags?: string[] }): void {
    if (options.filterCategory !== undefined) {
      if (typeof options.filterCategory !== "string" || options.filterCategory.trim() === "") {
        throw new ValidationError("filterCategory must be a non-empty string");
      }
    }
    if (options.filterTags !== undefined) {
      if (!Array.isArray(options.filterTags)) {
        throw new ValidationError("filterTags must be an array of non-empty strings");
      }
      for (const tag of options.filterTags) {
        if (typeof tag !== "string" || tag.trim() === "") {
          throw new ValidationError("Each tag in filterTags must be a non-empty string");
        }
      }
    }
  }
}
