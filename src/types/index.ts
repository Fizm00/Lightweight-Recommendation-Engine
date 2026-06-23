export interface GenericInteraction<TUser extends string | number = string, TItem extends string | number = string> {
  /** The unique identifier of the user. */
  readonly userId: TUser;
  /** The unique identifier of the item. */
  readonly itemId: TItem;
  /** The interaction rating, score, weight or count value. */
  readonly rating: number;
  /** The type of interaction, e.g. 'view', 'purchase', 'rate'. */
  readonly type?: string;
  /** The timestamp when the interaction occurred (Date, string, or number in milliseconds). */
  readonly timestamp?: number | string | Date;
  /** The optional category classification of the item. */
  readonly itemCategory?: string;
  /** The optional descriptive tags/keywords of the item. */
  readonly itemTags?: string[];
}

export interface Interaction extends GenericInteraction<string, string> {}

export interface GenericRecommendationReason<TUser extends string | number = string, TItem extends string | number = string> {
  /** The item ID that triggered this recommendation. */
  readonly triggerItemId?: TItem;
  /** The user ID that triggered this recommendation. */
  readonly triggerUserId?: TUser;
  /** The similarity score between the target and the trigger entity. */
  readonly similarity: number;
  /** The rating value given to/by the trigger entity. */
  readonly ratingGiven?: number;
  /** The explanation description in plain English text. */
  readonly explanation: string;
  /** The recommendation strategy or reason type. */
  readonly strategy?: string;
}

export interface RecommendationReason extends GenericRecommendationReason<string, string> {}

/**
 * Represents a recommendation result for an item.
 */
export interface GenericRecommendation<TItem extends string | number = string, TUser extends string | number = string> {
  /** The unique identifier of the recommended item. */
  readonly itemId: TItem;
  /** The recommendation score calculated by the engine. */
  readonly score: number;
  /** Optional explanation details of why this recommendation was generated. */
  readonly reasons?: GenericRecommendationReason<TUser, TItem>[];
}

export interface Recommendation extends GenericRecommendation<string, string> {}

/**
 * A user's profile represented as a map of item IDs to rating values.
 */
export type UserVector<TItem extends string | number = string> = Map<TItem, number>;

/**
 * The sparse matrix representation mapping user IDs to their respective user vectors.
 */
export type SparseMatrixStorage<TUser extends string | number = string, TItem extends string | number = string> = Map<TUser, UserVector<TItem>>;

/**
 * Represents the serialized state of the sparse matrix storage.
 */
export interface SerializedMatrixState {
  /** The nested matrix mapping user ID to items and ratings. */
  readonly storage: Record<string, Record<string, number>>;
  /** The item rating frequencies mapped by item ID. */
  readonly ratingsCount: Record<string, number>;
  /** The item view frequencies mapped by item ID. */
  readonly viewsCount: Record<string, number>;
  /** The item purchase frequencies mapped by item ID. */
  readonly purchasesCount: Record<string, number>;
  /** The item categories mapped by item ID. */
  readonly itemCategories?: Record<string, string>;
  /** The item tags mapped by item ID. */
  readonly itemTags?: Record<string, string[]>;
  /** Optional transition matrix and history state. */
  readonly transitionState?: SerializedTransitionState;
}

/**
 * Represents the serialized state of sequential transitions.
 */
export interface SerializedTransitionState {
  readonly transitions: Record<string, Record<string, number>>;
  readonly userHistory?: Record<string, Array<{ itemId: string; timestamp: number }>>;
}

/**
 * Options for session-based recommendations.
 */
export interface SessionRecommendationOptions {
  /** The session recommendation strategy: 'transition' or 'similarity'. Defaults to 'similarity'. */
  readonly sessionStrategy?: "transition" | "similarity";
  /** The decay factor for positional items in the active session. Defaults to 0.5. */
  readonly decayFactor?: number;
  /** The maximum number of recommendations to return. Optional. */
  readonly limit?: number;
  /** Whether to include explanation reasons for recommendations. Optional. */
  readonly explain?: boolean;
  /** Optional category filtering. */
  readonly filterCategory?: string;
  /** Optional tags filtering. */
  readonly filterTags?: string[];
  /** The similarity-based strategy to delegate to when using 'similarity' sessionStrategy. Defaults to 'item-based'. */
  readonly similarityStrategy?: "item-based" | "content-based";
  /** Optional minimum similarity threshold for recommendations. */
  readonly similarityThreshold?: number;
  /** Optional minimum intersection size for item-based similarity. */
  readonly minIntersectionSize?: number;
  /** Optional neighborhood limit (k) to use in similarity calculations. */
  readonly k?: number;
  /** Optional custom explanation formatter function. */
  readonly explanationFormatter?: ExplanationFormatter;
  /** Whether to use approximate nearest neighbor search via LSH. Optional. */
  readonly enableApproximateSearch?: boolean;
  /** Optional filter function to include/exclude item IDs. */
  readonly filter?: (itemId: string) => boolean;
  /** Optional array of item IDs to exclude from recommendations. */
  readonly excludeItemIds?: string[];
  /** Weight for the category similarity component in content-based similarity. Optional. */
  readonly categoryWeight?: number;
  /** Weight for the tags similarity component in content-based similarity. Optional. */
  readonly tagWeight?: number;
}

/**
 * Represents the full serialized state of the recommendation engine.
 */
export interface RecommenderState {
  /** The version of the serialization format schema. */
  readonly version: string;
  /** The serialized state of the sparse matrix. */
  readonly matrix: SerializedMatrixState;
}

export type ExplanationFormatter = (reason: RecommendationReason) => string;

