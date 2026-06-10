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
}

/**
 * Represents a recommendation result for an item.
 */
export interface Recommendation {
  /** The unique identifier of the recommended item. */
  readonly itemId: string;
  /** The recommendation score calculated by the engine. */
  readonly score: number;
}

/**
 * A user's profile represented as a map of item IDs to rating values.
 */
export type UserVector = Map<string, number>;

/**
 * The sparse matrix representation mapping user IDs to their respective user vectors.
 */
export type SparseMatrixStorage = Map<string, UserVector>;
