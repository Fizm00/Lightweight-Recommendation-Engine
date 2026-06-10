import { SparseMatrix } from "./core/matrix.js";
import type { Interaction, Recommendation } from "./types/index.js";
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
  private readonly itemCache = new SimilarityCache();
  private readonly userCache = new SimilarityCache();
  private readonly defaultStrategy: "item-based" | "user-based";
  private readonly defaultThreshold: number;
  private readonly defaultFallback: "most-rated" | "most-viewed" | "most-purchased" | "none";

  /**
   * Constructs a new NanoRecommender instance.
   *
   * @param config Optional engine configurations.
   */
  constructor(config: NanoRecommenderConfig = {}) {
    this.defaultStrategy = config.defaultStrategy ?? "item-based";
    this.defaultThreshold = config.defaultSimilarityThreshold ?? 0.0;
    this.defaultFallback = config.defaultFallbackStrategy ?? "most-rated";
  }

  /**
   * Clears the current interactions and loads a new batch bulk dataset.
   *
   * @param interactions The array of interactions to load.
   */
  public load(interactions: Interaction[]): void {
    this.matrix.clear();
    this.matrix.addInteractions(interactions);
    this.itemCache.clear();
    this.userCache.clear();
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
}
