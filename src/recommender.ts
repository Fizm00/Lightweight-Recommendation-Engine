import { SparseMatrix } from "./core/matrix.js";
import type { Interaction, Recommendation, RecommenderState } from "./types/index.js";
import {
  type ItemBasedRecommendationOptions,
  recommendForUser,
} from "./algorithms/item-based.js";
import {
  type UserBasedRecommendationOptions,
  recommendFromSimilarUsers,
} from "./algorithms/user-based.js";
import { getMostRated, getMostViewed, getMostPurchased } from "./algorithms/popularity.js";
import { SimilarityCache } from "./core/cache.js";
import { ValidationError } from "./errors/index.js";

/**
 * Configuration options for the NanoRecommender engine.
 */
export interface NanoRecommenderConfig {
  /** The default strategy to use in the recommend method. Defaults to 'item-based'. */
  readonly defaultStrategy?: "item-based" | "user-based";
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
export interface RecommendationOptions extends ItemBasedRecommendationOptions, UserBasedRecommendationOptions {
  /** The recommendation strategy to use: 'item-based' | 'user-based'. */
  readonly strategy?: "item-based" | "user-based";
  /** Fallback strategy for cold start users. Defaults to constructor default fallback strategy. */
  readonly fallbackStrategy?: "most-rated" | "most-viewed" | "most-purchased" | "none";
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
  private readonly defaultStrategy: "item-based" | "user-based";
  private readonly defaultThreshold: number;
  private readonly defaultFallback: "most-rated" | "most-viewed" | "most-purchased" | "none";
  private readonly interactionWeights?: Record<string, number>;
  private readonly decayHalfLifeDays?: number;
  private lastReferenceTimeMs = Date.now();

  /**
   * Constructs a new NanoRecommender instance.
   *
   * @param config Optional engine configurations.
   */
  constructor(config: NanoRecommenderConfig = {}) {
    this.defaultStrategy = config.defaultStrategy ?? "item-based";
    this.defaultThreshold = config.defaultSimilarityThreshold ?? 0.0;
    this.defaultFallback = config.defaultFallbackStrategy ?? "most-rated";

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
  }

  /**
   * Generates item recommendations for a user based on the selected strategy.
   *
   * @param userId The unique identifier of the target user.
   * @param options Configurable options for the recommendation process.
   * @returns An array of ranked recommendation objects.
   */
  public recommend(userId: string, options: RecommendationOptions = {}): Recommendation[] {
    const userVector = this.matrix.getUserVector(userId);
    const limit = options.limit ?? 10;

    if (!userVector || userVector.size === 0) {
      return this.handleColdStart(options.fallbackStrategy ?? this.defaultFallback, limit);
    }

    const strategy = options.strategy ?? this.defaultStrategy;
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    const combinedOptions = { similarityThreshold: threshold, ...options };

    if (strategy === "user-based") {
      return this.recommendUserBased(userId, combinedOptions);
    }
    return this.recommendItemBased(userId, combinedOptions);
  }

  /**
   * Handles recommendation for cold-start users.
   */
  private handleColdStart(
    strategy: "most-rated" | "most-viewed" | "most-purchased" | "none",
    limit: number
  ): Recommendation[] {
    if (strategy === "most-viewed") {
      return getMostViewed(this.matrix, limit);
    }
    if (strategy === "most-purchased") {
      return getMostPurchased(this.matrix, limit);
    }
    if (strategy === "most-rated") {
      return getMostRated(this.matrix, limit);
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
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    return recommendForUser(
      this.matrix,
      userId,
      { similarityThreshold: threshold, ...options },
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
    const threshold = options.similarityThreshold ?? this.defaultThreshold;
    return recommendFromSimilarUsers(
      this.matrix,
      userId,
      { similarityThreshold: threshold, ...options },
      this.userCache
    );
  }

  /**
   * Clears all interactions and internal datasets from the engine.
   */
  public clear(): void {
    this.matrix.clear();
    this.itemCache.clear();
    this.userCache.clear();
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
    this.lastReferenceTimeMs = Date.now();
  }
}
