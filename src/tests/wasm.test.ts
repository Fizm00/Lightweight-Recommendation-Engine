import test from "node:test";
import assert from "node:assert";
import { loadWasm, isWasmLoaded, mapToWasmVectors, clearWasmGlobalCache } from "../wasm/loader.js";
import { cosineSimilarity } from "../algorithms/cosine.js";
import { jaccardSimilarity } from "../algorithms/jaccard.js";
import { pearsonCorrelation } from "../algorithms/pearson.js";
import { NanoRecommender } from "../recommender.js";

test("WASM Backend - loadWasm and initialization", async () => {
  const success = await loadWasm();
  assert.strictEqual(success, true);
  assert.strictEqual(isWasmLoaded(), true);
});

test("WASM Backend - mapToWasmVectors alignment and sorting", () => {
  clearWasmGlobalCache();
  const v1 = new Map([
    ["apple", 1.5],
    ["banana", 2.0],
    ["cherry", 3.0],
  ]);
  const v2 = new Map([
    ["banana", 4.0],
    ["date", 5.0],
    ["cherry", 6.0],
  ]);

  const [keysA, valuesA, keysB, valuesB] = mapToWasmVectors(v1, v2);

  // Sorting should be:
  // "apple"  -> id 0
  // "banana" -> id 1
  // "cherry" -> id 2
  // "date"   -> id 3

  // v1 has: apple (0), banana (1), cherry (2)
  assert.deepStrictEqual(Array.from(keysA), [0, 1, 2]);
  assert.deepStrictEqual(Array.from(valuesA), [1.5, 2.0, 3.0]);

  // v2 has: banana (1), date (3), cherry (2) (but sorted alphabetically: banana, cherry, date)
  // banana (1), cherry (2), date (3)
  assert.deepStrictEqual(Array.from(keysB), [1, 2, 3]);
  assert.deepStrictEqual(Array.from(valuesB), [4.0, 6.0, 5.0]);
});

test("WASM Backend - Cosine Similarity precision comparison", async () => {
  await loadWasm();

  const v1 = new Map([
    ["item1", 5.0],
    ["item2", 3.0],
    ["item3", 0.0],
    ["item4", 2.0],
  ]);
  const v2 = new Map([
    ["item1", 4.0],
    ["item2", 0.0],
    ["item3", 4.0],
    ["item4", 1.0],
  ]);

  const scoreWasm = cosineSimilarity(v1, v2, 1);

  // Calculate manually in JS:
  // Magnitude v1: sqrt(25 + 9 + 0 + 4) = sqrt(38) = 6.164414002968976
  // Magnitude v2: sqrt(16 + 0 + 16 + 1) = sqrt(33) = 5.744562646538029
  // Dot product: (5*4) + (3*0) + (0*4) + (2*1) = 20 + 0 + 0 + 2 = 22
  // Cosine: 22 / (sqrt(38) * sqrt(33)) = 22 / 35.41186241922378 = 0.6212607519391807
  const expected = 22 / (Math.sqrt(38) * Math.sqrt(33));

  assert.ok(Math.abs(scoreWasm - expected) < 1e-9);
});

test("WASM Backend - Jaccard Similarity precision comparison", async () => {
  await loadWasm();

  const v1 = new Map([
    ["item1", 1.0],
    ["item2", 1.0],
    ["item3", 1.0],
  ]);
  const v2 = new Map([
    ["item2", 1.0],
    ["item3", 1.0],
    ["item4", 1.0],
    ["item5", 1.0],
  ]);

  const scoreWasm = jaccardSimilarity(v1, v2, 1);

  // Size A: 3, Size B: 4, Intersection: 2 (item2, item3)
  // Union: 3 + 4 - 2 = 5
  // Jaccard: 2 / 5 = 0.4
  const expected = 0.4;

  assert.strictEqual(scoreWasm, expected);
});

test("WASM Backend - Pearson Correlation precision comparison", async () => {
  await loadWasm();

  const v1 = new Map([
    ["item1", 5.0],
    ["item2", 3.0],
    ["item3", 1.0],
    ["item4", 2.0],
  ]);
  const v2 = new Map([
    ["item1", 3.0],
    ["item2", 1.0],
    ["item3", 2.0],
    ["item4", 4.0],
  ]);

  const scoreWasm = pearsonCorrelation(v1, v2, 1);

  // Mean v1: (5+3+1+2)/4 = 11/4 = 2.75
  // Mean v2: (3+1+2+4)/4 = 10/4 = 2.5
  // Mean-centered:
  // v1_mc: [2.25, 0.25, -1.75, -0.75]
  // v2_mc: [0.5, -1.5, -0.5, 1.5]
  // Mag v1_mc: sqrt(5.0625 + 0.0625 + 3.0625 + 0.5625) = sqrt(8.75) = 2.958039891549808
  // Mag v2_mc: sqrt(0.25 + 2.25 + 0.25 + 2.25) = sqrt(5.0) = 2.23606797749979
  // Dot product (only shared, here all are shared):
  // (2.25 * 0.5) + (0.25 * -1.5) + (-1.75 * -0.5) + (-0.75 * 1.5)
  // = 1.125 - 0.375 + 0.875 - 1.125 = 0.5
  // Pearson: 0.5 / (sqrt(8.75) * sqrt(5)) = 0.5 / sqrt(43.75) = 0.5 / 6.614378277661477 = 0.07559289460184544
  const expected = 0.5 / (Math.sqrt(8.75) * Math.sqrt(5));

  assert.ok(Math.abs(scoreWasm - expected) < 1e-9);
});

test("WASM Backend - End-to-end recommender test with Wasm", async () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 3 },
    { userId: "u2", itemId: "i1", rating: 4 },
    { userId: "u2", itemId: "i2", rating: 2 },
    { userId: "u2", itemId: "i3", rating: 5 },
  ]);

  const recs = recommender.recommend("u1", { limit: 5 });
  assert.ok(recs.length > 0);
  assert.strictEqual(recs[0]?.itemId, "i3");
});
