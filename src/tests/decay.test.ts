import { test } from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

// Helper to construct dates relative to now
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

test("Recommender Time-Decay - Happy Path (Exponential Decay)", () => {
  const recommender = new NanoRecommender({
    decayHalfLifeDays: 10,
  });

  const now = Date.now();
  const dataset = [
    // referenceTime will auto-calculate to 'now' since it's the maximum
    { userId: "u1", itemId: "i1", rating: 10.0, timestamp: now }, // 0 days elapsed -> 10.0 * 1.0 = 10.0
    { userId: "u1", itemId: "i2", rating: 10.0, timestamp: now - 10 * ONE_DAY_MS }, // 10 days elapsed -> 10.0 * 0.5 = 5.0
    { userId: "u1", itemId: "i3", rating: 10.0, timestamp: now - 20 * ONE_DAY_MS }, // 20 days elapsed -> 10.0 * 0.25 = 2.5
    { userId: "u1", itemId: "i4", rating: 10.0 }, // No timestamp -> no decay -> 10.0 * 1.0 = 10.0
  ];

  recommender.load(dataset);

  const state = recommender.export();
  const storage = state.matrix.storage;

  assert.strictEqual(storage.u1?.i1, 10.0);
  assert.strictEqual(storage.u1?.i2, 5.0);
  assert.strictEqual(storage.u1?.i3, 2.5);
  assert.strictEqual(storage.u1?.i4, 10.0);
});

test("Recommender Time-Decay - Custom Reference Time", () => {
  const recommender = new NanoRecommender({
    decayHalfLifeDays: 5,
  });

  const refTime = new Date("2026-06-12T00:00:00Z").getTime();
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 8.0, timestamp: refTime }, // 0 days elapsed -> 8.0
    { userId: "u1", itemId: "i2", rating: 8.0, timestamp: refTime - 5 * ONE_DAY_MS }, // 5 days elapsed -> 4.0
    { userId: "u1", itemId: "i3", rating: 8.0, timestamp: refTime - 10 * ONE_DAY_MS }, // 10 days elapsed -> 2.0
    { userId: "u1", itemId: "i4", rating: 8.0, timestamp: refTime + 5 * ONE_DAY_MS }, // Future timestamp -> capped elapsed to 0 -> 8.0
  ];

  recommender.load(dataset, { referenceTime: refTime });

  const state = recommender.export();
  const storage = state.matrix.storage;

  assert.strictEqual(storage.u1?.i1, 8.0);
  assert.strictEqual(storage.u1?.i2, 4.0);
  assert.strictEqual(storage.u1?.i3, 2.0);
  assert.strictEqual(storage.u1?.i4, 8.0);
});

test("Recommender Time-Decay - Support Various Timestamp Formats", () => {
  const recommender = new NanoRecommender({
    decayHalfLifeDays: 2,
  });

  const refTime = new Date("2026-06-12T00:00:00Z");
  const dataset = [
    { userId: "u1", itemId: "i1", rating: 4.0, timestamp: refTime }, // Date object
    { userId: "u1", itemId: "i2", rating: 4.0, timestamp: "2026-06-10T00:00:00Z" }, // ISO String (2 days ago -> 2.0)
    { userId: "u1", itemId: "i3", rating: 4.0, timestamp: refTime.getTime() - 4 * ONE_DAY_MS }, // ms number (4 days ago -> 1.0)
  ];

  recommender.load(dataset, { referenceTime: refTime });

  const state = recommender.export();
  const storage = state.matrix.storage;

  assert.strictEqual(storage.u1?.i1, 4.0);
  assert.strictEqual(storage.u1?.i2, 2.0);
  assert.strictEqual(storage.u1?.i3, 1.0);
});

test("Recommender Time-Decay - Validation Errors", () => {
  // 1. Invalid decayHalfLifeDays in constructor
  assert.throws(() => {
    new NanoRecommender({ decayHalfLifeDays: -5 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ decayHalfLifeDays: 0 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ decayHalfLifeDays: NaN });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ decayHalfLifeDays: Infinity });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ decayHalfLifeDays: "invalid" as any });
  }, ValidationError);

  // 2. Invalid referenceTime in load options
  const recommender = new NanoRecommender({ decayHalfLifeDays: 10 });
  assert.throws(() => {
    recommender.load([], { referenceTime: "invalid-date" });
  }, ValidationError);

  // 3. Invalid timestamp in interaction
  assert.throws(() => {
    recommender.load([
      { userId: "u1", itemId: "i1", rating: 5.0, timestamp: "invalid-timestamp" },
    ]);
  }, ValidationError);
});
