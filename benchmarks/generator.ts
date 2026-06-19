import type { Interaction } from "../src/types/index.js";

/**
 * A lightweight, seeded, deterministic pseudo-random number generator.
 */
class LCG {
  private seed: number;

  constructor(seed = 12345) {
    this.seed = seed;
  }

  /**
   * Generates the next pseudo-random floating point number in [0, 1).
   *
   * @returns A pseudo-random floating-point number.
   */
  public next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
}

/**
 * Generates interaction list for a single user.
 *
 * @param userId Target user ID.
 * @param numItems Maximum items to sample from.
 * @param count Number of items to select.
 * @param lcg Linear Congruential Generator instance.
 * @returns Array of interactions for the user.
 */
function generateUserInteractions(
  userId: string,
  numItems: number,
  count: number,
  lcg: LCG
): Interaction[] {
  const selected = new Set<number>();
  while (selected.size < count) {
    selected.add(Math.floor(lcg.next() * numItems));
  }
  return Array.from(selected).map((itemIdx) => {
    const rand = lcg.next();
    const type = rand < 0.5 ? "rate" : rand < 0.8 ? "view" : "purchase";
    const rating = Math.round((lcg.next() * 4 + 1) * 2) / 2;
    // Generate deterministic metadata for content-based strategies
    const itemCategory = `cat_${itemIdx % 10}`;
    const itemTags = [`tag_${itemIdx % 50}`, `tag_${(itemIdx + 1) % 50}`];
    return { userId, itemId: `i_${itemIdx}`, rating, type, itemCategory, itemTags };
  });
}

/**
 * Generates synthetic interaction data for benchmarking.
 *
 * @param numUsers Number of users.
 * @param numItems Number of items.
 * @param interactionsPerUser Baseline number of interactions per user.
 * @param densityMode Density distribution mode ("uniform" or "variable").
 * @returns An array of synthetic interaction events.
 */
export function generateSyntheticData(
  numUsers: number,
  numItems: number,
  interactionsPerUser: number,
  densityMode: "uniform" | "variable" = "uniform"
): Interaction[] {
  const lcg = new LCG();
  const interactions: Interaction[] = [];
  for (let u = 0; u < numUsers; u++) {
    let count = interactionsPerUser;
    if (densityMode === "variable") {
      const r = lcg.next();
      if (r < 0.80) {
        count = Math.max(1, Math.floor(interactionsPerUser * 0.5));
      } else if (r < 0.95) {
        count = interactionsPerUser * 2;
      } else {
        count = interactionsPerUser * 10;
      }
      count = Math.min(count, numItems);
    }
    interactions.push(...generateUserInteractions(`u_${u}`, numItems, count, lcg));
  }
  return interactions;
}
