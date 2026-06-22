import type {
  GenericInteraction,
  Interaction,
  SparseMatrixStorage,
  SerializedMatrixState,
  SerializedTransitionState,
} from "../types/index.js";
import { InvalidInteractionError, ValidationError } from "../errors/index.js";
import { clearWasmGlobalCache, invalidateVectorCache } from "../wasm/loader.js";
import { LshIndex } from "./lsh.js";
import { invalidateMagnitudeCache, invalidateSortedKeysCache } from "../algorithms/math.js";

/**
 * A performance-oriented, in-memory representation of a sparse interaction matrix.
 *
 * It uses nested maps (`Map<TUser, Map<TItem, number>>`) to efficiently store and query
 * user-item ratings/scores while minimizing memory overhead for sparse datasets.
 */
export class SparseMatrix<
  TUser extends string | number = string,
  TItem extends string | number = string,
> {
  private readonly useIntegerMapping: boolean;
  private readonly maxUserProfileSize: number | undefined;
  private readonly userToIdx = new Map<string, number>();
  private readonly idxToUser: string[] = [];
  private readonly itemToIdx = new Map<string, number>();
  private readonly idxToItem: string[] = [];

  private userIdType: "string" | "number" | undefined;
  private itemIdType: "string" | "number" | undefined;

  private readonly storage: SparseMatrixStorage<any, any> = new Map();
  private readonly itemIndex: Set<any> = new Set();
  private readonly transpose: Map<any, Map<any, number>> = new Map();
  private interactionCount = 0;
  private readonly ratingsCount = new Map<any, number>();
  private readonly viewsCount = new Map<any, number>();
  private readonly purchasesCount = new Map<any, number>();
  private readonly itemCategories = new Map<any, string>();
  private readonly itemTags = new Map<any, string[]>();
  private readonly transitions = new Map<any, Map<any, number>>();
  private readonly userHistory = new Map<
    any,
    Array<{ itemId: any; timestamp: number }>
  >();

  private readonly userLsh: LshIndex | undefined;
  private readonly itemLsh: LshIndex | undefined;
  private isBatchLoading = false;

  constructor(options: {
    useIntegerMapping?: boolean;
    maxUserProfileSize?: number | undefined;
    lshBands?: number;
    lshRows?: number;
  } = {}) {
    this.useIntegerMapping = options.useIntegerMapping ?? false;
    this.maxUserProfileSize = options.maxUserProfileSize;
    if (options.lshBands !== undefined || options.lshRows !== undefined) {
      const lshOpts: { bands?: number; rows?: number } = {};
      if (options.lshBands !== undefined) lshOpts.bands = options.lshBands;
      if (options.lshRows !== undefined) lshOpts.rows = options.lshRows;
      this.userLsh = new LshIndex(lshOpts);
      this.itemLsh = new LshIndex(lshOpts);
    }
  }

  public getOriginalItemId(iIdx: any): string {
    if (!this.useIntegerMapping) return String(iIdx);
    return this.idxToItem[iIdx] ?? String(iIdx);
  }

  public getOriginalUserId(uIdx: any): string {
    if (!this.useIntegerMapping) return String(uIdx);
    return this.idxToUser[uIdx] ?? String(uIdx);
  }

  public toInternalUser(userId: any): any {
    if (!this.useIntegerMapping) return userId;
    if (typeof userId !== "string") return userId;
    let idx = this.userToIdx.get(userId);
    if (idx === undefined) {
      idx = this.userToIdx.size;
      this.userToIdx.set(userId, idx);
      this.idxToUser.push(userId);
    }
    return idx;
  }

  public toInternalItem(itemId: any): any {
    if (!this.useIntegerMapping) return itemId;
    if (typeof itemId !== "string") return itemId;
    let idx = this.itemToIdx.get(itemId);
    if (idx === undefined) {
      idx = this.itemToIdx.size;
      this.itemToIdx.set(itemId, idx);
      this.idxToItem.push(itemId);
    }
    return idx;
  }

  public lookupInternalUser(userId: any): any {
    if (!this.useIntegerMapping) return userId;
    if (typeof userId !== "string") return userId;
    return this.userToIdx.get(userId);
  }

  public lookupInternalItem(itemId: any): any {
    if (!this.useIntegerMapping) return itemId;
    if (typeof itemId !== "string") return itemId;
    return this.itemToIdx.get(itemId);
  }

  /**
   * Adds a single user-item interaction to the sparse matrix.
   * Updates the rating if the interaction already exists.
   *
   * @param interaction The interaction payload to add.
   * @throws {InvalidInteractionError} If the interaction payload is invalid.
   */
  public addInteraction(interaction: GenericInteraction<TUser, TItem>): void {
    this.validateInteraction(interaction);

    const userId = this.toInternalUser(interaction.userId);
    const itemId = this.toInternalItem(interaction.itemId);
    const { rating, type } = interaction;

    let userVector = this.storage.get(userId);
    if (!userVector) {
      userVector = new Map<any, number>();
      this.storage.set(userId, userVector);
    } else {
      invalidateVectorCache(userVector);
      invalidateMagnitudeCache(userVector);
      invalidateSortedKeysCache(userVector);
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
      itemVector = new Map<any, number>();
      this.transpose.set(itemId, itemVector);
    } else {
      invalidateVectorCache(itemVector);
      invalidateMagnitudeCache(itemVector);
      invalidateSortedKeysCache(itemVector);
    }
    itemVector.set(userId, rating);

    if (type === "view") {
      this.viewsCount.set(itemId, (this.viewsCount.get(itemId) ?? 0) + 1);
    } else if (type === "purchase") {
      this.purchasesCount.set(
        itemId,
        (this.purchasesCount.get(itemId) ?? 0) + 1,
      );
    }

    if (interaction.itemCategory !== undefined) {
      this.itemCategories.set(itemId, interaction.itemCategory);
    }
    if (interaction.itemTags !== undefined) {
      this.itemTags.set(itemId, interaction.itemTags);
    }

    const timestampMs = this.parseTimestamp(interaction.timestamp);
    if (timestampMs !== undefined) {
      let history = this.userHistory.get(userId);
      if (!history) {
        history = [];
        this.userHistory.set(userId, history);
      }

      const exactIdx = history.findIndex((h) => h.timestamp === timestampMs);
      if (exactIdx !== -1) {
        const oldItem = history[exactIdx]!.itemId;
        if (oldItem !== itemId) {
          if (exactIdx > 0) {
            this.recordTransition(history[exactIdx - 1]!.itemId, oldItem, -1);
            this.recordTransition(history[exactIdx - 1]!.itemId, itemId, 1);
          }
          if (exactIdx < history.length - 1) {
            this.recordTransition(oldItem, history[exactIdx + 1]!.itemId, -1);
            this.recordTransition(itemId, history[exactIdx + 1]!.itemId, 1);
          }
          history[exactIdx] = { itemId, timestamp: timestampMs };
        }
      } else {
        let insertIdx = history.findIndex((h) => h.timestamp > timestampMs);
        if (insertIdx === -1) {
          insertIdx = history.length;
        }

        const prevItem = insertIdx > 0 ? history[insertIdx - 1]!.itemId : null;
        const nextItem =
          insertIdx < history.length ? history[insertIdx]!.itemId : null;

        if (prevItem !== null && nextItem !== null) {
          this.recordTransition(prevItem, nextItem, -1);
        }
        if (prevItem !== null) {
          this.recordTransition(prevItem, itemId, 1);
        }
        if (nextItem !== null) {
          this.recordTransition(itemId, nextItem, 1);
        }

        history.splice(insertIdx, 0, { itemId, timestamp: timestampMs });
      }
    }

    this.pruneUserProfile(userId);
    this.updateLshForInteraction(userId, itemId);
  }

  private pruneUserProfile(userId: any): void {
    if (this.maxUserProfileSize === undefined) return;
    const userVector = this.storage.get(userId);
    if (!userVector || userVector.size <= this.maxUserProfileSize) return;

    // 1. Determine oldest item ID
    let oldestItemId: any = undefined;
    const history = this.userHistory.get(userId);
    if (history && history.length > 0) {
      oldestItemId = history[0]!.itemId;
    } else {
      oldestItemId = userVector.keys().next().value;
    }

    if (oldestItemId === undefined) return;

    // 2. Remove oldest item from userVector
    userVector.delete(oldestItemId);
    invalidateVectorCache(userVector);
    invalidateMagnitudeCache(userVector);
    invalidateSortedKeysCache(userVector);
    this.interactionCount--;

    // 3. Decrement ratings count
    const count = this.ratingsCount.get(oldestItemId) ?? 0;
    if (count <= 1) {
      this.ratingsCount.delete(oldestItemId);
      this.itemIndex.delete(oldestItemId);
      this.itemCategories.delete(oldestItemId);
      this.itemTags.delete(oldestItemId);
    } else {
      this.ratingsCount.set(oldestItemId, count - 1);
    }

    // 4. Remove from transpose
    const itemVector = this.transpose.get(oldestItemId);
    if (itemVector) {
      invalidateVectorCache(itemVector);
      invalidateMagnitudeCache(itemVector);
      invalidateSortedKeysCache(itemVector);
      itemVector.delete(userId);
      if (itemVector.size === 0) {
        this.transpose.delete(oldestItemId);
      }
    }

    // 5. Update history and transitions if applicable
    if (history && history.length > 0 && history[0]!.itemId === oldestItemId) {
      const evicted = history.shift()!;
      if (history.length > 0) {
        // Decrement transition probability
        this.recordTransition(evicted.itemId, history[0]!.itemId, -1);
      }
    }

    if (!this.isBatchLoading && this.itemLsh && oldestItemId !== undefined) {
      const itemVector = this.transpose.get(oldestItemId);
      if (itemVector && itemVector.size > 0) {
        this.itemLsh.update(oldestItemId, itemVector);
      } else {
        this.itemLsh.remove(oldestItemId);
      }
    }
  }

  private updateLshForInteraction(userId: any, itemId: any): void {
    if (this.isBatchLoading) return;
    if (this.userLsh) {
      const userVector = this.storage.get(userId);
      if (userVector && userVector.size > 0) {
        this.userLsh.update(userId, userVector);
      } else {
        this.userLsh.remove(userId);
      }
    }
    if (this.itemLsh) {
      const itemVector = this.transpose.get(itemId);
      if (itemVector && itemVector.size > 0) {
        this.itemLsh.update(itemId, itemVector);
      } else {
        this.itemLsh.remove(itemId);
      }
    }
  }

  public rebuildLshIndices(): void {
    if (this.userLsh) {
      this.userLsh.clear();
      for (const [u, vector] of this.storage.entries()) {
        if (vector.size > 0) {
          this.userLsh.update(u, vector);
        }
      }
    }
    if (this.itemLsh) {
      this.itemLsh.clear();
      for (const [i, vector] of this.transpose.entries()) {
        if (vector.size > 0) {
          this.itemLsh.update(i, vector);
        }
      }
    }
  }

  public getUserLshCandidates(userId: TUser, minMatches = 1): Set<TUser> {
    const internalCandidates = this.getUserLshCandidatesInternal(userId, minMatches);
    const candidates = new Set<TUser>();
    const u = this.lookupInternalUser(userId);
    if (this.useIntegerMapping) {
      for (const idx of internalCandidates) {
        if (idx !== u) {
          candidates.add(this.idxToUser[idx] as any);
        }
      }
    } else {
      for (const idx of internalCandidates) {
        if (idx !== userId) {
          candidates.add(idx);
        }
      }
    }
    return candidates;
  }

  public getUserLshCandidatesInternal(userId: any, minMatches = 1): Set<any> {
    if (!this.userLsh) return new Set();
    const u = this.lookupInternalUser(userId);
    if (u === undefined) return new Set();
    const vector = this.storage.get(u);
    if (!vector) return new Set();
    const candidates = this.userLsh.getCandidates(vector, minMatches);
    const result = new Set<any>();
    for (const c of candidates) {
      if (c !== u) {
        result.add(c);
      }
    }
    return result;
  }

  public getItemLshCandidates(itemId: TItem, minMatches = 1): Set<TItem> {
    const internalCandidates = this.getItemLshCandidatesInternal(itemId, minMatches);
    const candidates = new Set<TItem>();
    const i = this.lookupInternalItem(itemId);
    if (this.useIntegerMapping) {
      for (const idx of internalCandidates) {
        if (idx !== i) {
          candidates.add(this.idxToItem[idx] as any);
        }
      }
    } else {
      for (const idx of internalCandidates) {
        if (idx !== itemId) {
          candidates.add(idx);
        }
      }
    }
    return candidates;
  }

  public getItemLshCandidatesInternal(itemId: any, minMatches = 1): Set<any> {
    if (!this.itemLsh) return new Set();
    const i = this.lookupInternalItem(itemId);
    if (i === undefined) return new Set();
    const vector = this.transpose.get(i);
    if (!vector) return new Set();
    const candidates = this.itemLsh.getCandidates(vector, minMatches);
    const result = new Set<any>();
    for (const c of candidates) {
      if (c !== i) {
        result.add(c);
      }
    }
    return result;
  }

  /**
   * Validates the input interaction payload.
   *
   * @param interaction The interaction payload.
   * @throws {InvalidInteractionError} If the validation fails.
   */
  private validateInteraction(
    interaction: GenericInteraction<TUser, TItem>,
  ): void {
    if (!interaction) {
      throw new InvalidInteractionError(
        "Interaction cannot be null or undefined",
      );
    }

    const { userId, itemId, rating, type } = interaction;

    const currentUserIdType = typeof userId;
    if (
      (currentUserIdType !== "string" && currentUserIdType !== "number") ||
      (currentUserIdType === "string" && (userId as string).trim() === "")
    ) {
      throw new InvalidInteractionError(
        "userId must be a non-empty string or a number",
      );
    }

    const currentItemIdType = typeof itemId;
    if (
      (currentItemIdType !== "string" && currentItemIdType !== "number") ||
      (currentItemIdType === "string" && (itemId as string).trim() === "")
    ) {
      throw new InvalidInteractionError(
        "itemId must be a non-empty string or a number",
      );
    }

    if (this.userIdType === undefined) {
      this.userIdType = currentUserIdType;
    } else if (currentUserIdType !== this.userIdType) {
      throw new InvalidInteractionError(`userId must be a ${this.userIdType}`);
    }

    if (this.itemIdType === undefined) {
      this.itemIdType = currentItemIdType;
    } else if (currentItemIdType !== this.itemIdType) {
      throw new InvalidInteractionError(`itemId must be a ${this.itemIdType}`);
    }

    if (
      typeof rating !== "number" ||
      Number.isNaN(rating) ||
      !Number.isFinite(rating)
    ) {
      throw new InvalidInteractionError("rating must be a finite number");
    }

    if (
      type !== undefined &&
      (typeof type !== "string" || type.trim() === "")
    ) {
      throw new InvalidInteractionError(
        "type must be a non-empty string if provided",
      );
    }

    if (interaction.itemCategory !== undefined) {
      if (
        typeof interaction.itemCategory !== "string" ||
        interaction.itemCategory.trim() === ""
      ) {
        throw new InvalidInteractionError(
          "itemCategory must be a non-empty string if provided",
        );
      }
    }

    if (interaction.itemTags !== undefined) {
      if (!Array.isArray(interaction.itemTags)) {
        throw new InvalidInteractionError(
          "itemTags must be an array of non-empty strings if provided",
        );
      }
      for (const tag of interaction.itemTags) {
        if (typeof tag !== "string" || tag.trim() === "") {
          throw new InvalidInteractionError(
            "Each tag in itemTags must be a non-empty string",
          );
        }
      }
    }
  }

  /**
   * Adds multiple user-item interactions to the sparse matrix.
   *
   * @param interactions Array of interaction payloads to add.
   * @throws {ValidationError} If the inputs argument is not an array.
   * @throws {InvalidInteractionError} If any of the interaction payloads are invalid.
   */
  public addInteractions(
    interactions: GenericInteraction<TUser, TItem>[],
  ): void {
    if (!Array.isArray(interactions)) {
      throw new ValidationError("interactions must be an array");
    }

    const wasBatch = this.isBatchLoading;
    this.isBatchLoading = true;

    try {
      // Sort interactions by timestamp ascending to ensure sequential transitions are processed in order
      const sorted = [...interactions].sort((a, b) => {
        const tA = this.parseTimestamp(a.timestamp) ?? 0;
        const tB = this.parseTimestamp(b.timestamp) ?? 0;
        return tA - tB;
      });

      for (const interaction of sorted) {
        this.addInteraction(interaction);
      }
    } finally {
      this.isBatchLoading = wasBatch;
    }

    if (!this.isBatchLoading) {
      this.rebuildLshIndices();
    }
  }

  /**
   * Retrieves the interaction vector (profile) for a user.
   *
   * @param userId The unique identifier of the user.
   * @returns The user's interaction map, or undefined if the user has no interactions.
   */
  public getUserVector(userId: TUser): ReadonlyMap<TItem, number> | undefined {
    if (
      userId === undefined ||
      userId === null ||
      (typeof userId === "string" && userId.trim() === "")
    ) {
      return undefined;
    }
    const internalUser = this.lookupInternalUser(userId);
    if (internalUser === undefined) return undefined;

    const vector = this.storage.get(internalUser);
    if (!vector) return undefined;

    if (this.useIntegerMapping) {
      if (typeof userId === "number") {
        return vector;
      }
      const self = this;
      return new Proxy(vector, {
        get(target, prop, receiver) {
          if (prop === "get") {
            return (key: any) => {
              const internalKey =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              return internalKey !== undefined
                ? target.get(internalKey)
                : undefined;
            };
          }
          if (prop === "has") {
            return (key: any) => {
              const internalKey =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              return internalKey !== undefined
                ? target.has(internalKey)
                : false;
            };
          }
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as any;
    }

    return vector;
  }

  /**
   * Retrieves the rating assigned by a user to a specific item.
   *
   * @param userId The unique identifier of the user.
   * @param itemId The unique identifier of the item.
   * @returns The rating/score if found, otherwise undefined.
   */
  public getUserRating(userId: TUser, itemId: TItem): number | undefined {
    if (
      userId === undefined ||
      userId === null ||
      (typeof userId === "string" && userId.trim() === "")
    ) {
      return undefined;
    }
    if (
      itemId === undefined ||
      itemId === null ||
      (typeof itemId === "string" && itemId.trim() === "")
    ) {
      return undefined;
    }
    const u = this.lookupInternalUser(userId);
    const i = this.lookupInternalItem(itemId);
    if (u === undefined || i === undefined) return undefined;
    return this.storage.get(u)?.get(i);
  }

  /**
   * Checks if a user has any interactions in the sparse matrix.
   *
   * @param userId The unique identifier of the user.
   * @returns True if the user exists, false otherwise.
   */
  public hasUser(userId: TUser): boolean {
    if (
      userId === undefined ||
      userId === null ||
      (typeof userId === "string" && userId.trim() === "")
    ) {
      return false;
    }
    const u = this.lookupInternalUser(userId);
    return u !== undefined ? this.storage.has(u) : false;
  }

  /**
   * Checks if an item has any interactions in the sparse matrix.
   *
   * @param itemId The unique identifier of the item.
   * @returns True if the item exists, false otherwise.
   */
  public hasItem(itemId: TItem): boolean {
    if (
      itemId === undefined ||
      itemId === null ||
      (typeof itemId === "string" && itemId.trim() === "")
    ) {
      return false;
    }
    const i = this.lookupInternalItem(itemId);
    return i !== undefined ? this.itemIndex.has(i) : false;
  }

  /**
   * Retrieves all unique user identifiers present in the matrix.
   *
   * @returns An array of unique user IDs.
   */
  public getUserIds(): TUser[] {
    if (this.useIntegerMapping) {
      return this.idxToUser as any;
    }
    return Array.from(this.storage.keys());
  }

  /**
   * Retrieves all unique item identifiers present in the matrix.
   *
   * @returns An array of unique item IDs.
   */
  public getItemIds(): TItem[] {
    if (this.useIntegerMapping) {
      return this.idxToItem as any;
    }
    return Array.from(this.itemIndex);
  }

  public getInternalItemIds(): any[] {
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
    this.itemCategories.clear();
    this.itemTags.clear();
    this.transitions.clear();
    this.userHistory.clear();
    this.userToIdx.clear();
    this.idxToUser.length = 0;
    this.itemToIdx.clear();
    this.idxToItem.length = 0;
    this.userIdType = undefined;
    this.itemIdType = undefined;
    clearWasmGlobalCache();
  }

  /**
   * Retrieves the category classification for an item.
   *
   * @param itemId The unique identifier of the item.
   * @returns The item's category, or undefined if not set.
   */
  public getItemCategory(itemId: TItem): string | undefined {
    const i = this.lookupInternalItem(itemId);
    return i !== undefined ? this.itemCategories.get(i) : undefined;
  }

  /**
   * Retrieves the descriptive tags for an item.
   *
   * @param itemId The unique identifier of the item.
   * @returns The item's tags array, or undefined if not set.
   */
  public getItemTags(itemId: TItem): string[] | undefined {
    const i = this.lookupInternalItem(itemId);
    return i !== undefined ? this.itemTags.get(i) : undefined;
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
  public getRatingsCountMap(): ReadonlyMap<TItem, number> {
    return this.ratingsCount;
  }

  /**
   * Retrieves the views count map (item ID -> count of users who viewed it).
   *
   * @returns The read-only views count map.
   */
  public getViewsCountMap(): ReadonlyMap<TItem, number> {
    return this.viewsCount;
  }

  /**
   * Retrieves the purchases count map (item ID -> count of users who purchased it).
   *
   * @returns The read-only purchases count map.
   */
  public getPurchasesCountMap(): ReadonlyMap<TItem, number> {
    return this.purchasesCount;
  }

  /**
   * Retrieves the transpose matrix representation (item -> user -> rating).
   *
   * @returns The read-only transposed matrix.
   */
  public getTransposeMatrix(): ReadonlyMap<TItem, ReadonlyMap<TUser, number>> {
    if (this.useIntegerMapping) {
      const self = this;
      return new Proxy(this.transpose, {
        get(target, prop, receiver) {
          if (prop === "get") {
            return (key: any) => {
              const internalItem =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              if (internalItem === undefined) return undefined;
              const userMap = target.get(internalItem);
              if (!userMap) return undefined;
              return new Proxy(userMap, {
                get(t, p, r) {
                  if (p === "get") {
                    return (k: any) => {
                      const internalUser =
                        typeof k === "string" ? self.userToIdx.get(k) : k;
                      return internalUser !== undefined
                        ? t.get(internalUser)
                        : undefined;
                    };
                  }
                  if (p === "has") {
                    return (k: any) => {
                      const internalUser =
                        typeof k === "string" ? self.userToIdx.get(k) : k;
                      return internalUser !== undefined
                        ? t.has(internalUser)
                        : false;
                    };
                  }
                  const val = Reflect.get(t, p);
                  return typeof val === "function" ? val.bind(t) : val;
                },
              });
            };
          }
          if (prop === "has") {
            return (key: any) => {
              const internalItem =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              return internalItem !== undefined
                ? target.has(internalItem)
                : false;
            };
          }
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as any;
    }
    return this.transpose;
  }

  public getTransposeMatrixRaw(): Map<any, Map<any, number>> {
    return this.transpose;
  }

  /**
   * Retrieves transitions from a given itemId.
   *
   * @param fromItemId The itemId representing the start of a transition.
   * @returns A map of target item IDs and their transition counts.
   */
  public getTransitions(
    fromItemId: TItem,
  ): ReadonlyMap<TItem, number> | undefined {
    const internalItem = this.lookupInternalItem(fromItemId);
    if (internalItem === undefined) return undefined;
    const transitionsMap = this.transitions.get(internalItem);
    if (!transitionsMap) return undefined;

    if (this.useIntegerMapping) {
      if (typeof fromItemId === "number") {
        return transitionsMap;
      }
      const self = this;
      return new Proxy(transitionsMap, {
        get(target, prop, receiver) {
          if (prop === "get") {
            return (key: any) => {
              const internalKey =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              return internalKey !== undefined
                ? target.get(internalKey)
                : undefined;
            };
          }
          if (prop === "has") {
            return (key: any) => {
              const internalKey =
                typeof key === "string" ? self.itemToIdx.get(key) : key;
              return internalKey !== undefined
                ? target.has(internalKey)
                : false;
            };
          }
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as any;
    }

    return transitionsMap;
  }

  /**
   * Retrieves chronological history of item interactions for a user.
   *
   * @param userId The unique identifier of the user.
   * @returns An array of item ID and timestamp records.
   */
  public getUserHistory(
    userId: TUser,
  ): ReadonlyArray<{ itemId: TItem; timestamp: number }> | undefined {
    const internalUser = this.lookupInternalUser(userId);
    if (internalUser === undefined) return undefined;
    const history = this.userHistory.get(internalUser);
    if (!history) return undefined;

    if (this.useIntegerMapping) {
      const self = this;
      return history.map((h) => ({
        itemId: self.idxToItem[h.itemId] as any,
        timestamp: h.timestamp,
      }));
    }

    return history;
  }

  private parseTimestamp(t?: number | string | Date): number | undefined {
    if (t === undefined || t === null) return undefined;
    if (t instanceof Date) return t.getTime();
    if (typeof t === "number") return t;
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private recordTransition(from: any, to: any, delta: number): void {
    let fromMap = this.transitions.get(from);
    if (!fromMap) {
      fromMap = new Map<any, number>();
      this.transitions.set(from, fromMap);
    }
    const count = (fromMap.get(to) ?? 0) + delta;
    if (count <= 0) {
      fromMap.delete(to);
      if (fromMap.size === 0) {
        this.transitions.delete(from);
      }
    } else {
      fromMap.set(to, count);
    }
  }

  private exportStateInternal(
    mapUser: (user: any) => string,
    mapItem: (item: any) => string,
  ): SerializedMatrixState {
    const storageRecord: Record<string, Record<string, number>> = {};
    for (const [userId, userVector] of this.storage.entries()) {
      const userStr = mapUser(userId);
      const userRecord: Record<string, number> = {};
      for (const [itemId, rating] of userVector.entries()) {
        userRecord[mapItem(itemId)] = rating;
      }
      storageRecord[userStr] = userRecord;
    }

    const ratingsCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.ratingsCount.entries()) {
      ratingsCountRecord[mapItem(itemId)] = count;
    }

    const viewsCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.viewsCount.entries()) {
      viewsCountRecord[mapItem(itemId)] = count;
    }

    const purchasesCountRecord: Record<string, number> = {};
    for (const [itemId, count] of this.purchasesCount.entries()) {
      purchasesCountRecord[mapItem(itemId)] = count;
    }

    const itemCategoriesRecord: Record<string, string> = {};
    for (const [itemId, category] of this.itemCategories.entries()) {
      itemCategoriesRecord[mapItem(itemId)] = category;
    }

    const itemTagsRecord: Record<string, string[]> = {};
    for (const [itemId, tags] of this.itemTags.entries()) {
      itemTagsRecord[mapItem(itemId)] = tags;
    }

    const transitionsRecord: Record<string, Record<string, number>> = {};
    for (const [fromId, fromMap] of this.transitions.entries()) {
      const fromStr = mapItem(fromId);
      const toRecord: Record<string, number> = {};
      for (const [toId, count] of fromMap.entries()) {
        toRecord[mapItem(toId)] = count;
      }
      transitionsRecord[fromStr] = toRecord;
    }

    const userHistoryRecord: Record<
      string,
      Array<{ itemId: string; timestamp: number }>
    > = {};
    for (const [userId, history] of this.userHistory.entries()) {
      userHistoryRecord[mapUser(userId)] = history.map((h) => ({
        itemId: mapItem(h.itemId),
        timestamp: h.timestamp,
      }));
    }

    return {
      storage: storageRecord,
      ratingsCount: ratingsCountRecord,
      viewsCount: viewsCountRecord,
      purchasesCount: purchasesCountRecord,
      itemCategories: itemCategoriesRecord,
      itemTags: itemTagsRecord,
      transitionState: {
        transitions: transitionsRecord,
        userHistory: userHistoryRecord,
      },
    };
  }

  /**
   * Exports the internal sparse matrix representation to a JSON-compatible object.
   *
   * @returns The serialized state of the sparse matrix.
   */
  public exportState(): SerializedMatrixState {
    if (this.useIntegerMapping) {
      return this.exportStateInternal(
        (uIdx) => this.idxToUser[uIdx]!,
        (iIdx) => this.idxToItem[iIdx]!,
      );
    }
    return this.exportStateInternal(
      (u) => String(u),
      (i) => String(i),
    );
  }

  private importStateInternal(
    state: SerializedMatrixState,
    parseUser: (userStr: string) => any,
    parseItem: (itemStr: string) => any,
  ): void {
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
      for (const [userStr, userRecord] of Object.entries(state.storage)) {
        if (typeof userStr !== "string" || userStr.trim() === "") {
          throw new ValidationError("Invalid userId in serialized storage");
        }
        if (typeof userRecord !== "object" || userRecord === null) {
          throw new ValidationError(`Invalid user record for user ${userStr}`);
        }

        const userId = parseUser(userStr);
        const userVector = new Map<any, number>();
        for (const [itemStr, rating] of Object.entries(userRecord)) {
          if (typeof itemStr !== "string" || itemStr.trim() === "") {
            throw new ValidationError(
              `Invalid itemId in user record for user ${userStr}`,
            );
          }
          if (
            typeof rating !== "number" ||
            Number.isNaN(rating) ||
            !Number.isFinite(rating)
          ) {
            throw new ValidationError(
              `Invalid rating for item ${itemStr} and user ${userStr}`,
            );
          }
          const itemId = parseItem(itemStr);
          userVector.set(itemId, rating);
          this.itemIndex.add(itemId);
          this.interactionCount++;

          // Update transpose matrix dynamically during import
          let itemVector = this.transpose.get(itemId);
          if (!itemVector) {
            itemVector = new Map<any, number>();
            this.transpose.set(itemId, itemVector);
          }
          itemVector.set(userId, rating);
        }
        this.storage.set(userId, userVector);
      }

      // Restore ratingsCount
      for (const [itemIdStr, count] of Object.entries(state.ratingsCount)) {
        if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
          throw new ValidationError("Invalid itemId in ratingsCount");
        }
        if (
          typeof count !== "number" ||
          Number.isNaN(count) ||
          !Number.isFinite(count) ||
          count < 0
        ) {
          throw new ValidationError(
            `Invalid ratingsCount for item ${itemIdStr}`,
          );
        }
        this.ratingsCount.set(parseItem(itemIdStr), count);
      }

      // Restore viewsCount
      for (const [itemIdStr, count] of Object.entries(state.viewsCount)) {
        if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
          throw new ValidationError("Invalid itemId in viewsCount");
        }
        if (
          typeof count !== "number" ||
          Number.isNaN(count) ||
          !Number.isFinite(count) ||
          count < 0
        ) {
          throw new ValidationError(`Invalid viewsCount for item ${itemIdStr}`);
        }
        this.viewsCount.set(parseItem(itemIdStr), count);
      }

      // Restore purchasesCount
      for (const [itemIdStr, count] of Object.entries(state.purchasesCount)) {
        if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
          throw new ValidationError("Invalid itemId in purchasesCount");
        }
        if (
          typeof count !== "number" ||
          Number.isNaN(count) ||
          !Number.isFinite(count) ||
          count < 0
        ) {
          throw new ValidationError(
            `Invalid purchasesCount for item ${itemIdStr}`,
          );
        }
        this.purchasesCount.set(parseItem(itemIdStr), count);
      }

      // Restore itemCategories if present
      if (state.itemCategories !== undefined) {
        if (
          typeof state.itemCategories !== "object" ||
          state.itemCategories === null
        ) {
          throw new ValidationError(
            "Invalid itemCategories in serialized state",
          );
        }
        for (const [itemIdStr, category] of Object.entries(
          state.itemCategories,
        )) {
          if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
            throw new ValidationError("Invalid itemId in itemCategories");
          }
          if (typeof category !== "string" || category.trim() === "") {
            throw new ValidationError(`Invalid category for item ${itemIdStr}`);
          }
          this.itemCategories.set(parseItem(itemIdStr), category);
        }
      }

      // Restore itemTags if present
      if (state.itemTags !== undefined) {
        if (typeof state.itemTags !== "object" || state.itemTags === null) {
          throw new ValidationError("Invalid itemTags in serialized state");
        }
        for (const [itemIdStr, tags] of Object.entries(state.itemTags)) {
          if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
            throw new ValidationError("Invalid itemId in itemTags");
          }
          if (!Array.isArray(tags)) {
            throw new ValidationError(
              `Invalid tags array for item ${itemIdStr}`,
            );
          }
          for (const tag of tags) {
            if (typeof tag !== "string" || tag.trim() === "") {
              throw new ValidationError(
                `Invalid tag in tags array for item ${itemIdStr}`,
              );
            }
          }
          this.itemTags.set(parseItem(itemIdStr), tags);
        }
      }

      // Restore transitionState if present
      if (state.transitionState !== undefined) {
        if (
          typeof state.transitionState !== "object" ||
          state.transitionState === null
        ) {
          throw new ValidationError(
            "Invalid transitionState in serialized state",
          );
        }
        const { transitions, userHistory } = state.transitionState;
        if (typeof transitions !== "object" || transitions === null) {
          throw new ValidationError(
            "Invalid transitions in serialized transitionState",
          );
        }

        for (const [fromIdStr, toRecord] of Object.entries(transitions)) {
          if (typeof fromIdStr !== "string" || fromIdStr.trim() === "") {
            throw new ValidationError("Invalid fromItemId in transitions");
          }
          if (typeof toRecord !== "object" || toRecord === null) {
            throw new ValidationError(
              `Invalid transitions record for item ${fromIdStr}`,
            );
          }
          const fromId = parseItem(fromIdStr);
          const fromMap = new Map<any, number>();
          for (const [toIdStr, count] of Object.entries(toRecord)) {
            if (typeof toIdStr !== "string" || toIdStr.trim() === "") {
              throw new ValidationError(
                `Invalid toItemId in transitions for item ${fromIdStr}`,
              );
            }
            if (
              typeof count !== "number" ||
              Number.isNaN(count) ||
              !Number.isFinite(count) ||
              count < 0
            ) {
              throw new ValidationError(
                `Invalid transition count for item ${fromIdStr} to ${toIdStr}`,
              );
            }
            fromMap.set(parseItem(toIdStr), count);
          }
          this.transitions.set(fromId, fromMap);
        }

        if (userHistory !== undefined) {
          if (typeof userHistory !== "object" || userHistory === null) {
            throw new ValidationError(
              "Invalid userHistory in serialized transitionState",
            );
          }
          for (const [userStr, historyArr] of Object.entries(userHistory)) {
            if (typeof userStr !== "string" || userStr.trim() === "") {
              throw new ValidationError("Invalid userId in userHistory");
            }
            if (!Array.isArray(historyArr)) {
              throw new ValidationError(
                `Invalid history array for user ${userStr}`,
              );
            }
            const userId = parseUser(userStr);
            const historyCopy: Array<{ itemId: any; timestamp: number }> = [];
            for (const item of historyArr) {
              if (typeof item !== "object" || item === null) {
                throw new ValidationError(
                  `Invalid history item for user ${userStr}`,
                );
              }
              const { itemId: itemIdStr, timestamp } = item;
              if (typeof itemIdStr !== "string" || itemIdStr.trim() === "") {
                throw new ValidationError(
                  `Invalid itemId in history item for user ${userStr}`,
                );
              }
              if (
                typeof timestamp !== "number" ||
                Number.isNaN(timestamp) ||
                !Number.isFinite(timestamp)
              ) {
                throw new ValidationError(
                  `Invalid timestamp in history item for user ${userStr}`,
                );
              }
              historyCopy.push({ itemId: parseItem(itemIdStr), timestamp });
            }
            this.userHistory.set(userId, historyCopy);
          }
        }
      }
      this.rebuildLshIndices();
    } catch (error) {
      this.clear(); // Clean up partial state if error occurs
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(
        `Error importing matrix state: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Clears the current matrix and restores it from a serialized state.
   *
   * @param state The serialized state of the sparse matrix to restore.
   * @throws {ValidationError} If the state payload is invalid or corrupt.
   */
  public importState(state: SerializedMatrixState): void {
    if (this.useIntegerMapping) {
      this.importStateInternal(
        state,
        (uStr) => this.toInternalUser(uStr),
        (iStr) => this.toInternalItem(iStr),
      );
    } else {
      this.importStateInternal(
        state,
        (u) => u as any,
        (i) => i as any,
      );
    }
  }
}
