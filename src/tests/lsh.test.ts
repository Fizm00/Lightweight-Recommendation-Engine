import test from "node:test";
import assert from "node:assert";
import { LshIndex } from "../core/lsh.js";
import { SparseMatrix } from "../core/matrix.js";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("LshIndex - Direct usage", () => {
  const index = new LshIndex({ bands: 4, rows: 4 });
  
  const v1 = new Map([["item1", 5], ["item2", 3]]);
  const v2 = new Map([["item1", 5], ["item2", 3]]); // same
  const v3 = new Map([["item1", -5], ["item2", -3]]); // opposite direction
  
  index.update("entity1", v1);
  index.update("entity2", v2);
  index.update("entity3", v3);

  const candidates1 = index.getCandidates(v1);
  // Should contain entity1 and entity2 (sharing buckets)
  assert.ok(candidates1.has("entity1"));
  assert.ok(candidates1.has("entity2"));

  // Clear LSH
  index.clear();
  assert.strictEqual(index.getCandidates(v1).size, 0);
});

test("SparseMatrix - LSH Integration", () => {
  // Initialize with LSH enabled
  const matrix = new SparseMatrix<string, string>({
    lshBands: 4,
    lshRows: 4,
  });

  matrix.addInteractions([
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 3 },
    { userId: "u2", itemId: "i1", rating: 5 },
    { userId: "u2", itemId: "i2", rating: 3 },
    { userId: "u3", itemId: "i3", rating: 1 },
  ]);

  const userCandidates = matrix.getUserLshCandidates("u1");
  // u2 is similar, u3 is different
  assert.ok(userCandidates.has("u2"));

  const itemCandidates = matrix.getItemLshCandidates("i1");
  assert.ok(itemCandidates.has("i2"));
});

test("NanoRecommender - LSH Configuration & Validation", () => {
  // Invalid config types
  assert.throws(() => {
    new NanoRecommender({ enableApproximateSearch: "invalid" as any });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ lshBands: -1 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ lshRows: 2.5 });
  }, ValidationError);

  // Valid config
  const recommender = new NanoRecommender({
    enableApproximateSearch: true,
    lshBands: 8,
    lshRows: 8,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 3 },
    { userId: "u2", itemId: "i1", rating: 5 },
    { userId: "u2", itemId: "i2", rating: 3 },
  ]);

  // Query options propagation
  const recs = recommender.recommend("u1", { enableApproximateSearch: true });
  assert.ok(Array.isArray(recs));
});
