import test from "node:test";
import assert from "node:assert";
import {
  calculateMagnitude,
  calculateDotProduct,
  normalizeVector,
  intersectionSize,
  sharedItems,
} from "../algorithms/math.js";

test("Vector Math - calculateMagnitude", () => {
  const empty = new Map<string, number>();
  assert.strictEqual(calculateMagnitude(empty), 0);

  const single = new Map([["a", -5.5]]);
  assert.strictEqual(calculateMagnitude(single), 5.5);

  const vec = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  assert.strictEqual(calculateMagnitude(vec), 5);
});

test("Vector Math - calculateDotProduct", () => {
  const empty = new Map<string, number>();
  const v1 = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const v2 = new Map([
    ["b", 2],
    ["c", 5],
  ]);
  const nonOverlapping = new Map([["d", 10]]);

  assert.strictEqual(calculateDotProduct(empty, v1), 0);
  assert.strictEqual(calculateDotProduct(v1, empty), 0);
  assert.strictEqual(calculateDotProduct(v1, nonOverlapping), 0);

  // Overlapping b: 4 * 2 = 8
  assert.strictEqual(calculateDotProduct(v1, v2), 8);
  assert.strictEqual(calculateDotProduct(v2, v1), 8);
});

test("Vector Math - normalizeVector", () => {
  const empty = new Map<string, number>();
  assert.strictEqual(normalizeVector(empty).size, 0);

  const zeroVector = new Map([["a", 0]]);
  assert.strictEqual(normalizeVector(zeroVector).size, 0);

  const vec = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const normalized = normalizeVector(vec);

  assert.strictEqual(normalized.get("a"), 0.6);
  assert.strictEqual(normalized.get("b"), 0.8);
  assert.strictEqual(calculateMagnitude(normalized), 1);
});

test("Vector Math - intersectionSize", () => {
  const empty = new Map<string, number>();
  const v1 = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const v2 = new Map([
    ["b", 2],
    ["c", 5],
  ]);

  assert.strictEqual(intersectionSize(empty, v1), 0);
  assert.strictEqual(intersectionSize(v1, empty), 0);
  assert.strictEqual(intersectionSize(v1, v2), 1);
});

test("Vector Math - sharedItems", () => {
  const empty = new Map<string, number>();
  const v1 = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const v2 = new Map([
    ["b", 2],
    ["c", 5],
  ]);

  assert.deepStrictEqual(sharedItems(empty, v1), new Set());
  assert.deepStrictEqual(sharedItems(v1, empty), new Set());
  assert.deepStrictEqual(sharedItems(v1, v2), new Set(["b"]));
});
