import { SparseMatrix } from "../core/matrix.js";
import type { GenericRecommendation } from "../types/index.js";

/**
 * Transposes a user-item matrix into an item-user matrix.
 *
 * @param matrix The sparse interaction matrix.
 * @returns The transposed matrix mapping item IDs to their user-rating maps.
 */
export function buildTransposeMatrix<TUser extends string | number = string, TItem extends string | number = string>(
  matrix: SparseMatrix<TUser, TItem>
): ReadonlyMap<TItem, ReadonlyMap<TUser, number>> {
  return matrix.getTransposeMatrix();
}

/**
 * A robust Min-Heap implementation to select the top-K recommendations.
 * Complexity: O(N log K) instead of O(N log N) sorting.
 */
class MinHeap<T> {
  private readonly data: T[] = [];
  constructor(private readonly compare: (a: T, b: T) => number, private readonly limit: number) {}

  public push(item: T): void {
    if (this.data.length < this.limit) {
      this.data.push(item);
      this.up(this.data.length - 1);
    } else if (this.compare(item, this.peek()) > 0) {
      this.data[0] = item;
      this.down(0);
    }
  }

  public peek(): T {
    return this.data[0]!;
  }

  public toSortedArray(): T[] {
    const res: T[] = [];
    while (this.data.length > 0) {
      res.push(this.pop()!);
    }
    return res.reverse();
  }

  private pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.down(0);
    }
    return top;
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(this.data[i]!, this.data[p]!) < 0) {
        this.swap(i, p);
        i = p;
      } else {
        break;
      }
    }
  }

  private down(i: number): void {
    const len = this.data.length;
    while ((i << 1) + 1 < len) {
      let child = (i << 1) + 1;
      const right = child + 1;
      if (right < len && this.compare(this.data[right]!, this.data[child]!) < 0) {
        child = right;
      }
      if (this.compare(this.data[child]!, this.data[i]!) < 0) {
        this.swap(i, child);
        i = child;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.data[i]!;
    this.data[i] = this.data[j]!;
    this.data[j] = temp;
  }
}

/**
 * Sorts and limits the recommendations list deterministically using a Min-Heap.
 *
 * @param recs Unsorted recommendations array.
 * @param limit The maximum number of elements.
 * @returns The sorted and sliced recommendations array.
 */
export function sortAndLimit<TItem extends string | number = string, TUser extends string | number = string>(
  recs: GenericRecommendation<TItem, TUser>[],
  limit: number
): GenericRecommendation<TItem, TUser>[] {
  if (recs.length === 0 || limit <= 0) {
    return [];
  }

  const compareRecs = (a: GenericRecommendation<TItem, TUser>, b: GenericRecommendation<TItem, TUser>) => {
    if (Math.abs(a.score - b.score) > 1e-9) {
      return a.score - b.score;
    }
    const idA = a.itemId;
    const idB = b.itemId;
    if (typeof idA === "number" && typeof idB === "number") {
      return idB - idA;
    }
    return String(idB).localeCompare(String(idA));
  };

  const heap = new MinHeap<GenericRecommendation<TItem, TUser>>(compareRecs, limit);
  for (const rec of recs) {
    heap.push(rec);
  }

  return heap.toSortedArray();
}
