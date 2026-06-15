/**
 * Represents a user-item interaction with a rating or score.
 */
export interface Interaction {
  /** The unique identifier of the user. */
  readonly userId: string;
  /** The unique identifier of the item. */
  readonly itemId: string;
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

/**
 * Represents the reason behind a recommendation.
 */
export interface RecommendationReason {
  /** The item ID that triggered this recommendation. */
  readonly triggerItemId?: string;
  /** The user ID that triggered this recommendation. */
  readonly triggerUserId?: string;
  /** The similarity score between the target and the trigger entity. */
  readonly similarity: number;
  /** The rating value given to/by the trigger entity. */
  readonly ratingGiven?: number;
  /** The explanation description in plain English text. */
  readonly explanation: string;
}

/**
 * Represents a recommendation result for an item.
 */
export interface Recommendation {
  /** The unique identifier of the recommended item. */
  readonly itemId: string;
  /** The recommendation score calculated by the engine. */
  readonly score: number;
  /** Optional explanation details of why this recommendation was generated. */
  readonly reasons?: RecommendationReason[];
}

/**
 * A user's profile represented as a map of item IDs to rating values.
 */
export type UserVector = Map<string, number>;

/**
 * The sparse matrix representation mapping user IDs to their respective user vectors.
 */
export type SparseMatrixStorage = Map<string, UserVector>;

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
