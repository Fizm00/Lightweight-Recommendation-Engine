import { SparseMatrix } from "./core/matrix.js";
import type {
  Interaction,
  Recommendation,
  RecommendationReason,
  RecommenderState,
  SessionRecommendationOptions,
  GenericRecommendation,
  GenericRecommendationReason,
  ExplanationFormatter
} from "./types/index.js";
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
import { recommendSessionTransition, recommendSessionSimilarity } from "./algorithms/session-based.js";
import { getMostRated, getMostViewed, getMostPurchased } from "./algorithms/popularity.js";
import { SimilarityCache } from "./core/cache.js";
import { ValidationError } from "./errors/index.js";
import { sortAndLimit } from "./utils/matrix-utils.js";
import { loadWasm, setWasmStrategy, setWasmMinVectorSize } from "./wasm/loader.js";

/**
 * Configuration options for the NanoRecommender engine.
 */
export interface NanoRecommenderConfig {
  /** The default strategy to use in the recommend method. Defaults to 'item-based'. */
  readonly defaultStrategy?: "item-based" | "user-based" | "hybrid" | "content-based" | "auto";
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
  /** Optional maximum user profile size for capping. Must be a positive integer. */
  readonly maxUserProfileSize?: number;
  /** Strategy for WebAssembly usage: 'auto', 'always', or 'never'. Defaults to 'auto'. */
  readonly wasmStrategy?: "auto" | "always" | "never";
  /** Crossover minimum vector size for WASM auto strategy. Defaults to 20. */
  readonly wasmMinVectorSize?: number;
  /** Optional custom explanation formatter function. */
  readonly explanationFormatter?: ExplanationFormatter;
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
  /** The recommendation strategy to use: 'item-based' | 'user-based' | 'hybrid' | 'content-based' | 'auto'. */
  readonly strategy?: "item-based" | "user-based" | "hybrid" | "content-based" | "auto";
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
  /** Whether to automatically detect and use the user's chronological interaction session. Optional. */
  readonly useSession?: boolean;
  /** The session strategy to use: 'transition' | 'similarity'. Optional. */
  readonly sessionStrategy?: "transition" | "similarity";
  /** The exponential decay factor for sequential weights. Optional. */
  readonly decayFactor?: number;
  /** The similarity strategy to delegate to if using 'similarity' session strategy. Optional. */
  readonly similarityStrategy?: "item-based" | "content-based";
  /** Optional custom explanation formatter function. */
  readonly explanationFormatter?: ExplanationFormatter;
}

/**
 * The unified public entrypoint facade for the nano-recommender library.
/**
 * Standard configurations presets for specific business domains.
 */
export const PRESETS = {
  ecommerce: {
    defaultStrategy: "hybrid" as const,
    defaultFallbackStrategy: "most-purchased" as const,
    defaultSimilarityThreshold: 0.1,
    defaultMinIntersectionSize: 2,
    defaultK: 50,
    defaultHybridAlpha: 0.7,
    interactionWeights: {
      purchase: 3.0,
      cart: 2.0,
      view: 1.0,
    }
  },
  media: {
    defaultStrategy: "item-based" as const,
    defaultFallbackStrategy: "most-viewed" as const,
    defaultSimilarityThreshold: 0.05,
    defaultMinIntersectionSize: 1,
    defaultK: 100,
    decayHalfLifeDays: 30,
    interactionWeights: {
      watch: 2.0,
      click: 1.0,
    }
  }
};

/**
 * The unified public entrypoint facade for the nano-recommender library.
 *
 * It manages an internal sparse interaction matrix and exposes simple APIs
 * for loading datasets and running recommendation queries without exposing internals.
 */
export class NanoRecommender {
  private readonly matrix: SparseMatrix<number, number>;

  private readonly itemCache: SimilarityCache;
  private readonly userCache: SimilarityCache;
  private readonly contentCache: SimilarityCache;
  private readonly defaultStrategy: "item-based" | "user-based" | "hybrid" | "content-based" | "auto";
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

  private readonly maxUserProfileSize: number | undefined;
  private readonly wasmStrategy: "auto" | "always" | "never";
  private readonly wasmMinVectorSize: number;
  private readonly explanationFormatter: ExplanationFormatter | undefined;

  /**
   * Constructs a new NanoRecommender instance.
   *
   * @param config Optional engine configurations or preset name.
   */
  constructor(config: NanoRecommenderConfig | "ecommerce" | "media" = {}) {
    let finalConfig: NanoRecommenderConfig = {};
    if (typeof config === "string") {
      if (config === "ecommerce" || config === "media") {
        finalConfig = PRESETS[config];
      } else {
        throw new ValidationError(`Unknown preset: ${config}`);
      }
    } else {
      finalConfig = config;
    }

    // Parse and validate maxUserProfileSize
    let maxProfileSize: number | undefined;
    if (finalConfig.maxUserProfileSize !== undefined) {
      if (
        typeof finalConfig.maxUserProfileSize !== "number" ||
        Number.isNaN(finalConfig.maxUserProfileSize) ||
        !Number.isFinite(finalConfig.maxUserProfileSize) ||
        !Number.isInteger(finalConfig.maxUserProfileSize) ||
        finalConfig.maxUserProfileSize <= 0
      ) {
        throw new ValidationError("maxUserProfileSize must be a positive integer");
      }
      maxProfileSize = finalConfig.maxUserProfileSize;
    }
    this.maxUserProfileSize = maxProfileSize;

    // Parse and validate wasmStrategy
    this.wasmStrategy = finalConfig.wasmStrategy ?? "auto";
    if (finalConfig.wasmStrategy !== undefined) {
      if (finalConfig.wasmStrategy !== "auto" && finalConfig.wasmStrategy !== "always" && finalConfig.wasmStrategy !== "never") {
        throw new ValidationError("wasmStrategy must be 'auto', 'always', or 'never'");
      }
      setWasmStrategy(finalConfig.wasmStrategy);
    }

    // Parse and validate wasmMinVectorSize
    this.wasmMinVectorSize = finalConfig.wasmMinVectorSize ?? 20;
    if (finalConfig.wasmMinVectorSize !== undefined) {
      if (
        typeof finalConfig.wasmMinVectorSize !== "number" ||
        Number.isNaN(finalConfig.wasmMinVectorSize) ||
        !Number.isFinite(finalConfig.wasmMinVectorSize) ||
        !Number.isInteger(finalConfig.wasmMinVectorSize) ||
        finalConfig.wasmMinVectorSize < 0
      ) {
        throw new ValidationError("wasmMinVectorSize must be a non-negative integer");
      }
      setWasmMinVectorSize(finalConfig.wasmMinVectorSize);
    }

    // Parse and validate explanationFormatter
    if (finalConfig.explanationFormatter !== undefined && typeof finalConfig.explanationFormatter !== "function") {
      throw new ValidationError("explanationFormatter must be a function");
    }
    this.explanationFormatter = finalConfig.explanationFormatter;

    this.matrix = new SparseMatrix<number, number>({
      useIntegerMapping: true,
      maxUserProfileSize: this.maxUserProfileSize,
    });

    this.defaultStrategy = finalConfig.defaultStrategy ?? "item-based";
    this.defaultThreshold = finalConfig.defaultSimilarityThreshold ?? 0.0;
    this.defaultFallback = finalConfig.defaultFallbackStrategy ?? "most-rated";

    if (finalConfig.defaultExplain !== undefined && typeof finalConfig.defaultExplain !== "boolean") {
      throw new ValidationError("defaultExplain must be a boolean");
    }
    this.defaultExplain = finalConfig.defaultExplain ?? false;

    if (finalConfig.defaultMinIntersectionSize !== undefined) {
      if (
        typeof finalConfig.defaultMinIntersectionSize !== "number" ||
        Number.isNaN(finalConfig.defaultMinIntersectionSize) ||
        !Number.isFinite(finalConfig.defaultMinIntersectionSize) ||
        !Number.isInteger(finalConfig.defaultMinIntersectionSize) ||
        finalConfig.defaultMinIntersectionSize < 1
      ) {
        throw new ValidationError("defaultMinIntersectionSize must be a positive integer");
      }
    }
    this.defaultMinIntersectionSize = finalConfig.defaultMinIntersectionSize ?? 1;

    if (finalConfig.defaultK !== undefined) {
      if (
        typeof finalConfig.defaultK !== "number" ||
        Number.isNaN(finalConfig.defaultK) ||
        !Number.isFinite(finalConfig.defaultK) ||
        !Number.isInteger(finalConfig.defaultK) ||
        finalConfig.defaultK < 1
      ) {
        throw new ValidationError("defaultK must be a positive integer");
      }
      this.defaultK = finalConfig.defaultK;
    }

    if (finalConfig.defaultHybridAlpha !== undefined) {
      if (
        typeof finalConfig.defaultHybridAlpha !== "number" ||
        Number.isNaN(finalConfig.defaultHybridAlpha) ||
        !Number.isFinite(finalConfig.defaultHybridAlpha) ||
        finalConfig.defaultHybridAlpha < 0.0 ||
        finalConfig.defaultHybridAlpha > 1.0
      ) {
        throw new ValidationError("defaultHybridAlpha must be a number between 0.0 and 1.0");
      }
    }
    this.defaultHybridAlpha = finalConfig.defaultHybridAlpha ?? 0.5;

    if (finalConfig.interactionWeights) {
      if (typeof finalConfig.interactionWeights !== "object" || finalConfig.interactionWeights === null) {
        throw new ValidationError("interactionWeights must be a valid object");
      }
      for (const [type, weight] of Object.entries(finalConfig.interactionWeights)) {
        if (typeof weight !== "number" || Number.isNaN(weight) || !Number.isFinite(weight) || weight <= 0) {
          throw new ValidationError(`Weight for interaction type '${type}' must be a positive, finite number`);
        }
      }
      this.interactionWeights = finalConfig.interactionWeights;
    }

    if (finalConfig.decayHalfLifeDays !== undefined) {
      if (
        typeof finalConfig.decayHalfLifeDays !== "number" ||
        Number.isNaN(finalConfig.decayHalfLifeDays) ||
        !Number.isFinite(finalConfig.decayHalfLifeDays) ||
        finalConfig.decayHalfLifeDays <= 0
      ) {
        throw new ValidationError("decayHalfLifeDays must be a positive, finite number");
      }
      this.decayHalfLifeDays = finalConfig.decayHalfLifeDays;
    }

    let catW = finalConfig.defaultContentCategoryWeight;
    let tagW = finalConfig.defaultContentTagWeight;
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
    if (finalConfig.maxSimilarityCacheSize !== undefined) {
      if (
        typeof finalConfig.maxSimilarityCacheSize !== "number" ||
        Number.isNaN(finalConfig.maxSimilarityCacheSize) ||
        !Number.isFinite(finalConfig.maxSimilarityCacheSize) ||
        !Number.isInteger(finalConfig.maxSimilarityCacheSize) ||
        finalConfig.maxSimilarityCacheSize <= 0
      ) {
        throw new ValidationError("maxSimilarityCacheSize must be a positive integer");
      }
      maxCacheSize = finalConfig.maxSimilarityCacheSize;
    }

    this.itemCache = new SimilarityCache(maxCacheSize);
    this.itemCache.toInternal = (id) => this.matrix.toInternalItem(id);
    this.userCache = new SimilarityCache(maxCacheSize);
    this.userCache.toInternal = (id) => this.matrix.toInternalUser(id);
    this.contentCache = new SimilarityCache(maxCacheSize);
    this.contentCache.toInternal = (id) => this.matrix.toInternalItem(id);

    loadWasm().catch(() => {
      // Fallback silently
    });
  }

  /**
   * Creates a NanoRecommender instance pre-configured for a specific domain preset.
   *
   * @param preset The name of the preset ("ecommerce" | "media").
   * @param configOverrides Optional configurations to override preset defaults.
   * @returns A pre-configured NanoRecommender instance.
   */
  public static fromPreset(
    preset: "ecommerce" | "media",
    configOverrides: NanoRecommenderConfig = {}
  ): NanoRecommender {
    const presetConfig = PRESETS[preset];
    if (!presetConfig) {
      throw new ValidationError(`Unknown preset: ${preset}`);
    }
    return new NanoRecommender({
      ...presetConfig,
      ...configOverrides,
    });
  }

  private mapOptionsFilters(options: any): any {
    const mapped: any = {};
    for (const [key, val] of Object.entries(options)) {
      if (val !== undefined) {
        mapped[key] = val;
      }
    }
    if (options.filter) {
      mapped.filter = (iIdx: number) => {
        const originalItemId = this.matrix.getOriginalItemId(iIdx);
        return originalItemId !== undefined ? options.filter!(originalItemId) : false;
      };
    }
    if (options.excludeItemIds) {
      mapped.excludeItemIds = options.excludeItemIds
        .map((id: string) => this.matrix.lookupInternalItem(id))
        .filter((id: any): id is number => id !== undefined);
    }
    return mapped;
  }

  private extractItemBasedOptions(options: any): ItemBasedRecommendationOptions<number> {
    const keys = [
      "limit",
      "similarityThreshold",
      "excludeInteracted",
      "similarityFunction",
      "minIntersectionSize",
      "filter",
      "excludeItemIds",
      "k",
      "explain",
      "filterCategory",
      "filterTags"
    ];
    const extracted: any = {};
    for (const key of keys) {
      if (options[key] !== undefined) {
        extracted[key] = options[key];
      }
    }
    return extracted;
  }

  private extractUserBasedOptions(options: any): UserBasedRecommendationOptions<number> {
    const keys = [
      "limit",
      "similarityThreshold",
      "excludeInteracted",
      "similarityFunction",
      "minIntersectionSize",
      "filter",
      "excludeItemIds",
      "k",
      "explain",
      "filterCategory",
      "filterTags"
    ];
    const extracted: any = {};
    for (const key of keys) {
      if (options[key] !== undefined) {
        extracted[key] = options[key];
      }
    }
    return extracted;
  }

  private extractContentBasedOptions(options: any): ContentBasedRecommendationOptions<number> {
    const keys = [
      "limit",
      "similarityThreshold",
      "excludeInteracted",
      "categoryWeight",
      "tagWeight",
      "filter",
      "excludeItemIds",
      "k",
      "explain",
      "filterCategory",
      "filterTags"
    ];
    const extracted: any = {};
    for (const key of keys) {
      if (options[key] !== undefined) {
        extracted[key] = options[key];
      }
    }
    return extracted;
  }

  private mapRecommendationsToOriginal(
    recs: GenericRecommendation<number, number>[],
    explain?: boolean,
    formatter?: ExplanationFormatter
  ): Recommendation[] {
    return recs.map(rec => {
      const originalItemId = this.matrix.getOriginalItemId(rec.itemId);
      if (originalItemId === undefined) {
        throw new Error(`Internal inconsistency: itemId ${rec.itemId} not found in map`);
      }

      let reasons: RecommendationReason[] | undefined;
      if (explain && rec.reasons) {
        reasons = rec.reasons.map(reason => {
          const res: any = {
            similarity: reason.similarity,
            explanation: reason.explanation,
            strategy: reason.strategy,
          };
          if (reason.triggerItemId !== undefined) {
            const mappedItem = this.matrix.getOriginalItemId(reason.triggerItemId);
            if (mappedItem !== undefined) {
              res.triggerItemId = mappedItem;
              res.explanation = res.explanation.replace(new RegExp(`item ${reason.triggerItemId}\\b`, 'g'), `item ${mappedItem}`);
            }
          }
          if (reason.triggerUserId !== undefined) {
            const mappedUser = this.matrix.getOriginalUserId(reason.triggerUserId);
            if (mappedUser !== undefined) {
              res.triggerUserId = mappedUser;
              res.explanation = res.explanation.replace(new RegExp(`user ${reason.triggerUserId}\\b`, 'g'), `user ${mappedUser}`);
            }
          }
          if (reason.ratingGiven !== undefined) {
            res.ratingGiven = reason.ratingGiven;
          }
          if (formatter) {
            res.explanation = formatter(res);
          }
          return res;
        });
      }

      return {
        itemId: originalItemId,
        score: rec.score,
        ...(reasons ? { reasons } : {}),
      };
    });
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

    this.matrix.addInteractions(processedInteractions as any);
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
    } as any);

    // 4. Invalidate specific cache entries
    const uIdx = this.matrix.lookupInternalUser(userId);
    const iIdx = this.matrix.lookupInternalItem(itemId);
    if (iIdx !== undefined) {
      this.itemCache.invalidate(iIdx);
      this.contentCache.invalidate(iIdx);
    }
    if (uIdx !== undefined) {
      this.userCache.invalidate(uIdx);
    }
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
    if (options.useSession !== undefined && typeof options.useSession !== "boolean") {
      throw new ValidationError("useSession must be a boolean");
    }
    this.validateFilteringOptions(options);

    const catW = options.categoryWeight;
    const tagW = options.tagWeight;
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
    }

    const explain = options.explain ?? this.defaultExplain;

    if (options.useSession) {
      const history = this.matrix.getUserHistory(userId as any);
      if (history && history.length > 0) {
        const sessionItemIds = history.map(h => h.itemId);

        const sessionOptions: any = {};
        if (options.sessionStrategy !== undefined) sessionOptions.sessionStrategy = options.sessionStrategy;
        if (options.decayFactor !== undefined) sessionOptions.decayFactor = options.decayFactor;
        if (options.limit !== undefined) sessionOptions.limit = options.limit;
        if (options.explain !== undefined) sessionOptions.explain = options.explain;
        if (options.filterCategory !== undefined) sessionOptions.filterCategory = options.filterCategory;
        if (options.filterTags !== undefined) sessionOptions.filterTags = options.filterTags;
        if (options.similarityStrategy !== undefined) sessionOptions.similarityStrategy = options.similarityStrategy;
        if (options.similarityThreshold !== undefined) sessionOptions.similarityThreshold = options.similarityThreshold;
        if (options.minIntersectionSize !== undefined) sessionOptions.minIntersectionSize = options.minIntersectionSize;
        if (options.k !== undefined) sessionOptions.k = options.k;
        if (options.explanationFormatter !== undefined) sessionOptions.explanationFormatter = options.explanationFormatter;

        const mappedSessionItemIds = sessionItemIds.map(id => this.matrix.lookupInternalItem(id));
        const internalRecs = this.recommendSessionInternal(mappedSessionItemIds, sessionOptions);
        return this.mapRecommendationsToOriginal(internalRecs, explain, options.explanationFormatter ?? this.explanationFormatter);
      }
    }

    const uIdx = this.matrix.lookupInternalUser(userId);
    const limit = options.limit ?? 10;
    const combinedOptions = { ...options, explain };

    if (uIdx === undefined || !this.matrix.hasUser(uIdx as any)) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit, combinedOptions);
    }

    const strategy = options.strategy ?? this.defaultStrategy;
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const finalOptions = { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, ...combinedOptions };

    let resolvedStrategy: "item-based" | "user-based" | "hybrid" | "content-based";
    if (strategy === "auto") {
      const userVector = this.matrix.getUserVector(uIdx as any);
      const interactionCount = userVector ? userVector.size : 0;
      if (interactionCount === 0) {
        resolvedStrategy = "item-based";
      } else if (interactionCount < 5) {
        const hasMetadata = (this.matrix as any).itemCategories.size > 0 || (this.matrix as any).itemTags.size > 0;
        if (hasMetadata) {
          resolvedStrategy = "content-based";
        } else {
          resolvedStrategy = "hybrid";
        }
      } else {
        const categories = new Set<string>();
        if (userVector) {
          for (const itemId of userVector.keys()) {
            const category = this.matrix.getItemCategory(itemId);
            if (category) {
              categories.add(category);
            }
          }
        }
        if (categories.size > 1) {
          resolvedStrategy = "user-based";
        } else {
          resolvedStrategy = "item-based";
        }
      }
    } else {
      resolvedStrategy = strategy;
    }

    let internalRecs: GenericRecommendation<number, number>[];
    const mapped = this.mapOptionsFilters(finalOptions);
    if (resolvedStrategy === "hybrid") {
      internalRecs = this.recommendHybridInternal(uIdx, finalOptions);
    } else if (resolvedStrategy === "user-based") {
      const cleanMapped = this.extractUserBasedOptions(mapped);
      internalRecs = this.recommendUserBasedInternal(uIdx, cleanMapped);
    } else if (resolvedStrategy === "content-based") {
      const cleanMapped = this.extractContentBasedOptions(mapped);
      internalRecs = this.recommendContentBasedInternal(uIdx, cleanMapped);
    } else {
      const cleanMapped = this.extractItemBasedOptions(mapped);
      internalRecs = this.recommendItemBasedInternal(uIdx, cleanMapped);
    }

    return this.mapRecommendationsToOriginal(internalRecs, explain, options.explanationFormatter ?? this.explanationFormatter);
  }

  /**
   * Generates recommendations using a Hybrid Strategy combining CF and Popularity scores (internal).
   */
  private recommendHybridInternal(
    uIdx: number,
    options: RecommendationOptions = {}
  ): GenericRecommendation<number, number>[] {
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

    const mappedOptions = this.mapOptionsFilters(options);

    if (popStrategy === "content-based") {
      const baseRecs = baseStrategy === "user-based"
        ? this.recommendUserBasedInternal(uIdx, this.extractUserBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }))
        : baseStrategy === "content-based"
        ? this.recommendContentBasedInternal(uIdx, this.extractContentBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }))
        : this.recommendItemBasedInternal(uIdx, this.extractItemBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }));

      const cbRecs = this.recommendContentBasedInternal(uIdx, this.extractContentBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }));

      if (baseRecs.length === 0 && cbRecs.length === 0) {
        return [];
      }

      const baseMap = new Map<number, GenericRecommendation<number, number>>();
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

      const cbMap = new Map<number, GenericRecommendation<number, number>>();
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

      const allItemIds = new Set<number>([...baseMap.keys(), ...cbMap.keys()]);
      const hybridRecs: GenericRecommendation<number, number>[] = [];

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

        let reasons: GenericRecommendationReason<number, number>[] | undefined;
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
      const cfRecs = baseStrategy === "user-based"
        ? this.recommendUserBasedInternal(uIdx, this.extractUserBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }))
        : baseStrategy === "content-based"
        ? this.recommendContentBasedInternal(uIdx, this.extractContentBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }))
        : this.recommendItemBasedInternal(uIdx, this.extractItemBasedOptions({ ...(mappedOptions as any), limit: Infinity, explain }));

      if (cfRecs.length === 0) {
        return [];
      }

      let popMap: ReadonlyMap<number, number>;
      if (popStrategy === "most-viewed") {
        popMap = this.matrix.getViewsCountMap();
      } else if (popStrategy === "most-purchased") {
        popMap = this.matrix.getPurchasesCountMap();
      } else {
        popMap = this.matrix.getRatingsCountMap();
      }

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

      const hybridRecs: GenericRecommendation<number, number>[] = itemsData.map(item => {
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

    const uIdx = this.matrix.lookupInternalUser(userId);
    if (uIdx === undefined || !this.matrix.hasUser(uIdx as any)) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit, { ...options, explain });
    }

    const internalRecs = this.recommendHybridInternal(uIdx, options);
    return this.mapRecommendationsToOriginal(internalRecs, explain, options.explanationFormatter ?? this.explanationFormatter);
  }

  /**
   * Handles recommendation for cold-start users.
   */
  private handleColdStart(
    strategy: "most-rated" | "most-viewed" | "most-purchased" | "none",
    limit: number,
    options: RecommendationOptions = {}
  ): Recommendation[] {
    const mapped = this.mapOptionsFilters(options);
    let internalRecs: GenericRecommendation<number, number>[];
    if (strategy === "most-viewed") {
      internalRecs = getMostViewed(this.matrix, limit, mapped);
    } else if (strategy === "most-purchased") {
      internalRecs = getMostPurchased(this.matrix, limit, mapped);
    } else if (strategy === "most-rated") {
      internalRecs = getMostRated(this.matrix, limit, mapped);
    } else {
      return [];
    }
    return this.mapRecommendationsToOriginal(internalRecs, options.explain, options.explanationFormatter ?? this.explanationFormatter);
  }

  private recommendItemBasedInternal(
    uIdx: number,
    options: ItemBasedRecommendationOptions<number> = {}
  ): GenericRecommendation<number, number>[] {
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const explain = options.explain ?? this.defaultExplain;

    if (this.lastItemMinIntersectionSize !== undefined && this.lastItemMinIntersectionSize !== minIntersection) {
      this.itemCache.clear();
    }
    this.lastItemMinIntersectionSize = minIntersection;

    const extracted = this.extractItemBasedOptions(options);
    return recommendForUser(
      this.matrix,
      uIdx,
      { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, explain, ...extracted },
      this.itemCache
    );
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
    options: RecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);

    const uIdx = this.matrix.lookupInternalUser(userId);
    if (uIdx === undefined || !this.matrix.hasUser(uIdx as any)) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, options.limit ?? 10, options);
    }

    const mapped = this.mapOptionsFilters(options);
    const cleanMapped = this.extractItemBasedOptions(mapped);
    const internalRecs = this.recommendItemBasedInternal(uIdx, cleanMapped);
    return this.mapRecommendationsToOriginal(internalRecs, options.explain ?? this.defaultExplain, options.explanationFormatter ?? this.explanationFormatter);
  }

  private recommendUserBasedInternal(
    uIdx: number,
    options: UserBasedRecommendationOptions<number> = {}
  ): GenericRecommendation<number, number>[] {
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const minIntersection = options.minIntersectionSize ?? this.defaultMinIntersectionSize;
    const k = options.k ?? this.defaultK;
    const explain = options.explain ?? this.defaultExplain;

    if (this.lastUserMinIntersectionSize !== undefined && this.lastUserMinIntersectionSize !== minIntersection) {
      this.userCache.clear();
    }
    this.lastUserMinIntersectionSize = minIntersection;

    const extracted = this.extractUserBasedOptions(options);
    return recommendFromSimilarUsers(
      this.matrix,
      uIdx,
      { similarityThreshold: threshold, minIntersectionSize: minIntersection, k, explain, ...extracted },
      this.userCache
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
    options: RecommendationOptions = {}
  ): Recommendation[] {
    if (options.explain !== undefined && typeof options.explain !== "boolean") {
      throw new ValidationError("explain must be a boolean");
    }
    this.validateFilteringOptions(options);

    const uIdx = this.matrix.lookupInternalUser(userId);
    if (uIdx === undefined || !this.matrix.hasUser(uIdx as any)) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, options.limit ?? 10, options);
    }

    const mapped = this.mapOptionsFilters(options);
    const cleanMapped = this.extractUserBasedOptions(mapped);
    const internalRecs = this.recommendUserBasedInternal(uIdx, cleanMapped);
    return this.mapRecommendationsToOriginal(internalRecs, options.explain ?? this.defaultExplain, options.explanationFormatter ?? this.explanationFormatter);
  }

  private recommendContentBasedInternal(
    uIdx: number,
    options: ContentBasedRecommendationOptions<number> = {}
  ): GenericRecommendation<number, number>[] {
    const extracted = this.extractContentBasedOptions(options);
    return recommendContentBased(
      this.matrix,
      uIdx,
      extracted,
      this.contentCache
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
    options: RecommendationOptions = {}
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

    const uIdx = this.matrix.lookupInternalUser(userId);
    if (uIdx === undefined || !this.matrix.hasUser(uIdx as any)) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, options.limit ?? 10, options);
    }

    const mapped = this.mapOptionsFilters(options);
    const cleanMapped = this.extractContentBasedOptions({
      similarityThreshold: threshold,
      k,
      explain,
      categoryWeight: catW,
      tagWeight: tagW,
      ...mapped,
    });
    const internalRecs = this.recommendContentBasedInternal(uIdx, cleanMapped);
    return this.mapRecommendationsToOriginal(internalRecs, explain, options.explanationFormatter ?? this.explanationFormatter);
  }

  private recommendSessionInternal(
    sessionItemIds: number[],
    options: SessionRecommendationOptions = {}
  ): GenericRecommendation<number, number>[] {
    const strategy = options.sessionStrategy ?? "similarity";
    if (strategy === "transition") {
      return recommendSessionTransition(this.matrix, sessionItemIds, options);
    }
    return recommendSessionSimilarity(
      this.matrix,
      sessionItemIds,
      options,
      this.itemCache,
      this.contentCache
    );
  }

  /**
   * Recommends items based on an active session of item interactions.
   *
   * @param sessionItemIds Array of item IDs in the current session (chronological order).
   * @param options Configurable options for the session recommendation.
   * @returns An array of ranked recommendation objects.
   */
  public recommendSession(
    sessionItemIds: string[],
    options: SessionRecommendationOptions = {}
  ): Recommendation[] {
    if (!Array.isArray(sessionItemIds)) {
      throw new ValidationError("sessionItemIds must be an array");
    }
    if (sessionItemIds.length === 0) {
      throw new ValidationError("sessionItemIds cannot be empty");
    }
    const mappedSessionItemIds: number[] = [];
    for (const itemId of sessionItemIds) {
      if (typeof itemId !== "string" || itemId.trim() === "") {
        throw new ValidationError("Each item in sessionItemIds must be a non-empty string");
      }
      const iIdx = this.matrix.lookupInternalItem(itemId);
      if (iIdx === undefined || !this.matrix.hasItem(iIdx as any)) {
        throw new ValidationError(`Item '${itemId}' in sessionItemIds does not exist in catalog`);
      }
      mappedSessionItemIds.push(iIdx);
    }

    const strategy = options.sessionStrategy ?? "similarity";
    if (strategy !== "transition" && strategy !== "similarity") {
      throw new ValidationError(`Unknown session strategy: ${strategy}`);
    }

    if (options.decayFactor !== undefined) {
      if (
        typeof options.decayFactor !== "number" ||
        Number.isNaN(options.decayFactor) ||
        !Number.isFinite(options.decayFactor) ||
        options.decayFactor < 0.0 ||
        options.decayFactor > 1.0
      ) {
        throw new ValidationError("decayFactor must be a number between 0.0 and 1.0");
      }
    }

    if (options.similarityStrategy !== undefined) {
      if (options.similarityStrategy !== "item-based" && options.similarityStrategy !== "content-based") {
        throw new ValidationError(`Unknown similarity strategy: ${options.similarityStrategy}`);
      }
    }

    this.validateFilteringOptions(options);

    const explain = options.explain ?? this.defaultExplain;
    const mapped = this.mapOptionsFilters(options);
    const internalRecs = this.recommendSessionInternal(mappedSessionItemIds, mapped);
    return this.mapRecommendationsToOriginal(internalRecs, explain, options.explanationFormatter ?? this.explanationFormatter);
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
   * Tracks and retrieves operational internal metrics (hit rates, memory usage, etc.).
   */
  public metrics(): RecommenderMetrics {
    const itemStats = this.itemCache.getStats();
    const userStats = this.userCache.getStats();
    const contentStats = this.contentCache.getStats();

    const totalHits = itemStats.hits + userStats.hits + contentStats.hits;
    const totalMisses = itemStats.misses + userStats.misses + contentStats.misses;
    const cacheHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0.0;

    const memoryUsage = typeof process !== "undefined" && typeof process.memoryUsage === "function"
      ? process.memoryUsage()
      : undefined;

    return {
      cacheHitRate,
      ...(memoryUsage ? { memoryUsage } : {}),
      cacheDetails: {
        itemCache: itemStats,
        userCache: userStats,
        contentCache: contentStats,
      },
      stats: this.stats(),
    };
  }

  /**
   * Returns a builder instance for querying user recommendations using method chaining.
   *
   * @param userId The unique identifier of the target user.
   * @returns A query builder instance.
   */
  public query(userId: string): RecommendationQueryBuilder {
    return new RecommendationQueryBuilder(this, userId);
  }

  /**
   * Returns a builder instance for querying session recommendations using method chaining.
   *
   * @param sessionItemIds List of unique item IDs in the active session.
   * @returns A session query builder instance.
   */
  public querySession(sessionItemIds: string[]): SessionRecommendationQueryBuilder {
    return new SessionRecommendationQueryBuilder(this, sessionItemIds);
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

    this.clear();

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

/**
 * Builder class for constructing and executing recommendation queries.
 */
export class RecommendationQueryBuilder {
  private readonly recommender: NanoRecommender;
  private readonly userId: string;
  private readonly options: RecommendationOptions = {};

  constructor(recommender: NanoRecommender, userId: string) {
    this.recommender = recommender;
    this.userId = userId;
  }

  public withStrategy(strategy: "item-based" | "user-based" | "hybrid" | "content-based" | "auto"): this {
    (this.options as any).strategy = strategy;
    return this;
  }

  public withLimit(limit: number): this {
    (this.options as any).limit = limit;
    return this;
  }

  public withSimilarityThreshold(threshold: number): this {
    (this.options as any).similarityThreshold = threshold;
    return this;
  }

  public withMinIntersectionSize(size: number): this {
    (this.options as any).minIntersectionSize = size;
    return this;
  }

  public withK(k: number): this {
    (this.options as any).k = k;
    return this;
  }

  public explain(explain: boolean = true): this {
    (this.options as any).explain = explain;
    return this;
  }

  public excludeItemIds(itemIds: string[]): this {
    (this.options as any).excludeItemIds = itemIds;
    return this;
  }

  public withFilter(filter: (itemId: string) => boolean): this {
    (this.options as any).filter = filter;
    return this;
  }

  public withCategory(category: string): this {
    (this.options as any).filterCategory = category;
    return this;
  }

  public withTags(tags: string[]): this {
    (this.options as any).filterTags = tags;
    return this;
  }

  public withHybridAlpha(alpha: number): this {
    (this.options as any).hybridAlpha = alpha;
    return this;
  }

  public withHybridBaseStrategy(baseStrategy: "item-based" | "user-based" | "content-based"): this {
    (this.options as any).hybridBaseStrategy = baseStrategy;
    return this;
  }

  public withHybridPopularityStrategy(popularityStrategy: "most-rated" | "most-viewed" | "most-purchased" | "content-based"): this {
    (this.options as any).hybridPopularityStrategy = popularityStrategy;
    return this;
  }

  public withSession(useSession: boolean = true): this {
    (this.options as any).useSession = useSession;
    return this;
  }

  public withSessionStrategy(strategy: "transition" | "similarity"): this {
    (this.options as any).sessionStrategy = strategy;
    return this;
  }

  public withSessionDecayFactor(decayFactor: number): this {
    (this.options as any).decayFactor = decayFactor;
    return this;
  }

  public withSessionSimilarityStrategy(strategy: "item-based" | "content-based"): this {
    (this.options as any).similarityStrategy = strategy;
    return this;
  }

  public execute(): Recommendation[] {
    return this.recommender.recommend(this.userId, this.options);
  }
}

/**
 * Builder class for constructing and executing session recommendation queries.
 */
export class SessionRecommendationQueryBuilder {
  private readonly recommender: NanoRecommender;
  private readonly sessionItemIds: string[];
  private readonly options: SessionRecommendationOptions = {};

  constructor(recommender: NanoRecommender, sessionItemIds: string[]) {
    this.recommender = recommender;
    this.sessionItemIds = sessionItemIds;
  }

  public withLimit(limit: number): this {
    (this.options as any).limit = limit;
    return this;
  }

  public withSessionStrategy(strategy: "transition" | "similarity"): this {
    (this.options as any).sessionStrategy = strategy;
    return this;
  }

  public withSessionDecayFactor(decayFactor: number): this {
    (this.options as any).decayFactor = decayFactor;
    return this;
  }

  public withSessionSimilarityStrategy(strategy: "item-based" | "content-based"): this {
    (this.options as any).similarityStrategy = strategy;
    return this;
  }

  public withSimilarityThreshold(threshold: number): this {
    (this.options as any).similarityThreshold = threshold;
    return this;
  }

  public withMinIntersectionSize(size: number): this {
    (this.options as any).minIntersectionSize = size;
    return this;
  }

  public withK(k: number): this {
    (this.options as any).k = k;
    return this;
  }

  public explain(explain: boolean = true): this {
    (this.options as any).explain = explain;
    return this;
  }

  public excludeItemIds(itemIds: string[]): this {
    (this.options as any).excludeItemIds = itemIds;
    return this;
  }

  public withFilter(filter: (itemId: string) => boolean): this {
    (this.options as any).filter = filter;
    return this;
  }

  public withCategory(category: string): this {
    (this.options as any).filterCategory = category;
    return this;
  }

  public withTags(tags: string[]): this {
    (this.options as any).filterTags = tags;
    return this;
  }

  public execute(): Recommendation[] {
    return this.recommender.recommendSession(this.sessionItemIds, this.options);
  }
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly hitRate: number;
}

export interface RecommenderMetrics {
  readonly cacheHitRate: number;
  readonly memoryUsage?: {
    readonly rss: number;
    readonly heapTotal: number;
    readonly heapUsed: number;
    readonly external: number;
    readonly arrayBuffers?: number;
  };
  readonly cacheDetails: {
    readonly itemCache: CacheStats;
    readonly userCache: CacheStats;
    readonly contentCache: CacheStats;
  };
  readonly stats: RecommenderStats;
}
