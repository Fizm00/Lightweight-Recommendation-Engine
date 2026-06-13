import type { Interaction, SparseMatrixStorage, SerializedMatrixState } from "../types/index.js";
import { InvalidInteractionError, ValidationError } from "../errors/index.js";

/**
 * A performance-oriented, in-memory representation of a sparse interaction matrix.
 *
 * It uses nested maps (`Map<string, Map<string, number>>`) to efficiently store and query
 * user-item ratings/scores while minimizing memory overhead for sparse datasets.
 */
export class SparseMatrix {
  private readonly storage: SparseMatrixStorage = new Map();
  private readonly itemIndex: Set<string> = new Set();
  private readonly transpose: Map<string, Map<string, number>> = new Map();
  private interactionCount = 0;
  private readonly ratingsCount = new Map<string, number>();
  private readonly viewsCount = new Map<string, number>();
  private readonly purchasesCount = new Map<string, number>();

  /**
   * Adds a single user-item interaction to the sparse matrix.
   * Updates the rating if the interaction already exists.
   *
   * @param interaction The interaction payload to add.
   * @throws {InvalidInteractionError} If the interaction payload is invalid.
   */
  public addInteraction(interaction: Interaction): void {
    this.validateInteraction(interaction);

    const { userId, itemId, rating, type } = interaction;
    let userVector = this.storage.get(userId);
    if (!userVector) {
      userVector = new Map<string, number>();
      this.storage.set(userId, userVector);
    }

    const isNew = !userVector.has(itemId);
    if (isNew) {
      this.interactionCount++;
      this.ratingsCount.set(itemId, (this.ratingsCount.get(itemId) ?? 0) + 1);
    }

    userVector.set(itemId, rating);
    this.itemIndex.add(itemId);

    // Update transpose matrix dynamically
    let itemVector = this.transpose.get(itemId);
    if (!itemVector) {
      itemVector = new Map<string, number>();
      this.transpose.set(itemId, itemVector);
    }
    itemVector.set(userId, rating);

    if (type === "view") {
      this.viewsCount.set(itemId, (this.viewsCount.get(itemId) ?? 0) + 1);
    } else if (type === "purchase") {
      this.purchasesCount.set(itemId, (this.purchasesCount.get(itemId) ?? 0) + 1);
    }
  }

  /**
   * Validates the input interaction payload.
   *
   * @param interaction The interaction payload.
   * @throws {InvalidInteractionError} If the validation fails.
   */
  private validateInteraction(interaction: Interaction): void {
    if (!interaction) {
      throw new InvalidInteractionError("Interaction cannot be null or undefined");
    }

    const { userId, itemId, rating, type } = interaction;

    if (typeof userId !== "string" || userId.trim() === "") {
      throw new InvalidInteractionError("userId must be a non-empty string");
    }

    if (typeof itemId !== "string" || itemId.trim() === "") {
      throw new InvalidInteractionError("itemId must be a non-empty string");
    }

    if (typeof rating !== "number" || Number.isNaN(rating) || !Number.isFinite(rating)) {
      throw new InvalidInteractionError("rating must be a finite number");
    }

    if (type !== undefined && (typeof type !== "string" || type.trim() === "")) {
      throw new InvalidInteractionError("type must be a non-empty string if provided");
    }
  }

  /**
   * Adds multiple user-item interactions to the sparse matrix.
   *
   * @param interactions Array of interaction payloads to add.
   * @throws {ValidationError} If the inputs argument is not an array.
   * @throws {InvalidInteractionError} If any of the interaction payloads are invalid.
   */
  public addInteractions(interactions: Interaction[]): void {
    if (!Array.isArray(interactions)) {
      throw new ValidationError("interactions must be an array");
    }

    for (const interaction of interactions) {
      this.addInteraction(interaction);
    }
  }

  /**
   * Retrieves the interaction vector (profile) for a user.
   *
   * @param userId The unique identifier of the user.
   * @returns The user's interaction map, or undefined if the user has no interactions.
   */
  public getUserVector(userId: string): ReadonlyMap<string, number> | undefined {
    if (typeof userId !== "string" || userId.trim() === "") {
      return undefined;
    }
    return this.storage.get(userId);
  }

  /**
   * Retrieves the rating assigned by a user to a specific item.
   *
   * @param userId The unique identifier of the user.
   * @param itemId The unique identifier of the item.
   * @returns The rating/score if found, otherwise undefined.
   */
  public getUserRating(userId: string, itemId: string): number | undefined {
    if (typeof userId !== "string" || userId.trim() === "") {
      return undefined;
    }
    if (typeof itemId !== "string" || itemId.trim() === "") {
      return undefined;
    }
    return this.storage.get(userId)?.get(itemId);
  }

  /**
   * Checks if a user has any interactions in the sparse matrix.
   *
   * @param userId The unique identifier of the user.
   * @returns True if the user exists, false otherwise.
   */
  public hasUser(userId: string): boolean {
    if (typeof userId !== "string" || userId.trim() === "") {
      return false;
    }
    return this.storage.has(userId);
  }

  /**
   * Checks if an item has any interactions in the sparse matrix.
   *
   * @param itemId The unique identifier of the item.
   * @returns True if the item exists, false otherwise.
   */
  public hasItem(itemId: string): boolean {
    if (typeof itemId !== "string" || itemId.trim() === "") {
      return false;
    }
    return this.itemIndex.has(itemId);
  }

  /**
   * Retrieves all unique user identifiers present in the matrix.
   *
   * @returns An array of unique user IDs.
   */
  public getUserIds(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Retrieves all unique item identifiers present in the matrix.
   *
   * @returns An array of unique item IDs.
   */
  public getItemIds(): string[] {
    return Array.from(this.itemIndex);
  }

  /**
   * Returns the total number of unique users in the matrix.
   *
   * @returns The count of unique users.
   */
  public getUserCount(): number {
    return this.storage.size;
  }

  /**
   * Returns the total number of unique items in the matrix.
   *
   * @returns The count of unique items.
   */
  public getItemCount(): number {
    return this.itemIndex.size;
  }

  /**
   * Returns the total number of interactions in the matrix.
   *
   * @returns The total interaction count.
   */
  public getInteractionCount(): number {
    return this.interactionCount;
  }

  /**
   * Clears all interaction data from the matrix, releasing references.
   */
  public clear(): void {
    this.storage.clear();
    this.itemIndex.clear();
    this.transpose.clear();
    this.interactionCount = 0;
    this.ratingsCount.clear();
    this.viewsCount.clear();
    this.purchasesCount.clear();
  }

  /**
   * Checks whether the matrix is empty (contains no interactions).
   *
   * @returns True if the matrix contains no interactions, false otherwise.
   */
  public isEmpty(): boolean {
    return this.storage.size === 0;
  }

  /**
   * Retrieves the ratings count map (item ID -> count of users who rated it).
   *
   * @returns The read-only ratings count map.
   */
  public getRatingsCountMap(): ReadonlyMap<string, number> {
    return this.ratingsCount;
  }

  /**
   * Retrieves the views count map (item ID -> count of users who viewed it).
   *
   * @returns The read-only views count map.
   */
  public getViewsCountMap(): ReadonlyMap<string, number> {
    return this.viewsCount;
  }

  /**
   * Retrieves the purchases count map (item ID -> count of users who purchased it).
   *
   * @returns The read-only purchases count map.
   */
  public getPurchasesCountMap(): ReadonlyMap<string, number> {
    return this.purchasesCount;
  }

  /**
   * Retrieves the transpose matrix representation (item -> user -> rating).
   *
   * @returns The read-only transposed matrix.
   */
  public getTransposeMatrix(): ReadonlyMap<string, ReadonlyMap<string, number>> {
    return this.transpose;
  }

  /**
   * Exports the internal sparse matrix representation to a JSON-compatible object.
   *
   * @returns The serialized state of the sparse matrix.
   */
  public exportState(): SerializedMatrixState {
    const storageRecord: Record<string, Record<string, number>> = {};
    for (const [userId, userVector] of this.storage.entries()) {
      const userRecord: Record<string, number> = {};
      for (const [itemId, rating] of userVector.entries()) {
        userRecord[itemId] = rating;
      }
      storageRecord[userId] = userRecord;
    }

    const ratingsCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.ratingsCount.entries()) {
      ratingsCountRecord[itemId] = count;
    }

    const viewsCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.viewsCount.entries()) {
      viewsCountRecord[itemId] = count;
    }

    const purchasesCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.purchasesCount.entries()) {
      purchasesCountRecord[itemId] = count;
    }

    return {
      storage: storageRecord,
      ratingsCount: ratingsCountRecord,
      viewsCount: viewsCountRecord,
      purchasesCount: purchasesCountRecord,
    };
  }

  /**
   * Clears the current matrix and restores it from a serialized state.
   *
   * @param state The serialized state of the sparse matrix to restore.
   * @throws {ValidationError} If the state payload is invalid or corrupt.
   */
  public importState(state: SerializedMatrixState): void {
    if (!state) {
      throw new ValidationError("Serialized state cannot be null or undefined");
    }

    if (
      typeof state.storage !== "object" ||
      state.storage === null ||
      typeof state.ratingsCount !== "object" ||
      state.ratingsCount === null ||
      typeof state.viewsCount !== "object" ||
      state.viewsCount === null ||
      typeof state.purchasesCount !== "object" ||
      state.purchasesCount === null
    ) {
      throw new ValidationError("Invalid serialized state structure");
    }

    this.clear();

    try {
      // Restore storage
      for (const [userId, userRecord] of Object.entries(state.storage)) {
        if (typeof userId !== "string" || userId.trim() === "") {
          throw new ValidationError("Invalid userId in serialized storage");
        }
        if (typeof userRecord !== "object" || userRecord === null) {
          throw new ValidationError(`Invalid user record for user ${userId}`);
        }

        const userVector = new Map<string, number>();
        for (const [itemId, rating] of Object.entries(userRecord)) {
          if (typeof itemId !== "string" || itemId.trim() === "") {
            throw new ValidationError(`Invalid itemId in user record for user ${userId}`);
          }
          if (typeof rating !== "number" || Number.isNaN(rating) || !Number.isFinite(rating)) {
            throw new ValidationError(`Invalid rating for item ${itemId} and user ${userId}`);
          }
          userVector.set(itemId, rating);
          this.itemIndex.add(itemId);
          this.interactionCount++;

          // Update transpose matrix dynamically during import
          let itemVector = this.transpose.get(itemId);
          if (!itemVector) {
            itemVector = new Map<string, number>();
            this.transpose.set(itemId, itemVector);
          }
          itemVector.set(userId, rating);
        }
        this.storage.set(userId, userVector);
      }

      // Restore ratingsCount
      for (const [itemId, count] of Object.entries(state.ratingsCount)) {
        if (typeof itemId !== "string" || itemId.trim() === "") {
          throw new ValidationError("Invalid itemId in ratingsCount");
        }
        if (typeof count !== "number" || Number.isNaN(count) || !Number.isFinite(count) || count < 0) {
          throw new ValidationError(`Invalid ratingsCount for item ${itemId}`);
        }
        this.ratingsCount.set(itemId, count);
      }

      // Restore viewsCount
      for (const [itemId, count] of Object.entries(state.viewsCount)) {
        if (typeof itemId !== "string" || itemId.trim() === "") {
          throw new ValidationError("Invalid itemId in viewsCount");
        }
        if (typeof count !== "number" || Number.isNaN(count) || !Number.isFinite(count) || count < 0) {
          throw new ValidationError(`Invalid viewsCount for item ${itemId}`);
        }
        this.viewsCount.set(itemId, count);
      }

      // Restore purchasesCount
      for (const [itemId, count] of Object.entries(state.purchasesCount)) {
        if (typeof itemId !== "string" || itemId.trim() === "") {
          throw new ValidationError("Invalid itemId in purchasesCount");
        }
        if (typeof count !== "number" || Number.isNaN(count) || !Number.isFinite(count) || count < 0) {
          throw new ValidationError(`Invalid purchasesCount for item ${itemId}`);
        }
        this.purchasesCount.set(itemId, count);
      }
    } catch (error) {
      this.clear(); // Clean up partial state if error occurs
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Error importing matrix state: ${(error as Error).message}`);
    }
  }
}
