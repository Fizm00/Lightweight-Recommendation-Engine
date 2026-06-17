import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Session-Based - Sequential transitions calculation and out-of-order updates", () => {
  const recommender = new NanoRecommender();

  // Load chronological interactions
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, timestamp: 1000 },
    { userId: "u1", itemId: "i2", rating: 3.0, timestamp: 2000 },
    { userId: "u1", itemId: "i3", rating: 4.0, timestamp: 3000 },
    { userId: "u2", itemId: "i1", rating: 5.0, timestamp: 1500 },
    { userId: "u2", itemId: "i2", rating: 4.0, timestamp: 2500 },
  ]);

  // Retrieve raw matrix
  const matrix = (recommender as any).matrix;

  // Transitions:
  // u1: i1 (1000) -> i2 (2000) -> i3 (3000)
  // u2: i1 (1500) -> i2 (2500)
  // Total transitions:
  // i1 -> i2 (count: 2)
  // i2 -> i3 (count: 1)
  
  const t_i1 = matrix.getTransitions("i1");
  assert.ok(t_i1);
  assert.strictEqual(t_i1.get("i2"), 2);

  const t_i2 = matrix.getTransitions("i2");
  assert.ok(t_i2);
  assert.strictEqual(t_i2.get("i3"), 1);

  // Add an interaction in-between (out-of-order update)
  // Add i4 for u1 at timestamp 1500
  // History for u1 becomes: i1 (1000) -> i4 (1500) -> i2 (2000) -> i3 (3000)
  // So:
  // - Transition i1 -> i2 from u1 is broken (count decreases by 1, from 2 to 1)
  // - Transition i1 -> i4 is created (count 1)
  // - Transition i4 -> i2 is created (count 1)
  recommender.addInteraction({ userId: "u1", itemId: "i4", rating: 4.0, timestamp: 1500 });

  const t_i1_after = matrix.getTransitions("i1");
  assert.strictEqual(t_i1_after.get("i2"), 1); // decreased from 2 to 1
  assert.strictEqual(t_i1_after.get("i4"), 1);

  const t_i4_after = matrix.getTransitions("i4");
  assert.strictEqual(t_i4_after.get("i2"), 1);
});

test("Session-Based - recommendSession transition-based strategy with decay factor", () => {
  const recommender = new NanoRecommender();
  
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 1, timestamp: 10 },
    { userId: "u1", itemId: "i2", rating: 1, timestamp: 20 },
    { userId: "u2", itemId: "i2", rating: 1, timestamp: 10 },
    { userId: "u2", itemId: "i3", rating: 1, timestamp: 20 },
    { userId: "u3", itemId: "i1", rating: 1, timestamp: 10 },
    { userId: "u3", itemId: "i4", rating: 1, timestamp: 20 },
  ]);

  // Transitions:
  // i1 -> i2 (count: 1)
  // i2 -> i3 (count: 1)
  // i1 -> i4 (count: 1)

  // Recommend for active session ["i1", "i2"]
  // Decay factor = 0.5
  // N = 2.
  // Item "i1" at index 0 weight = 0.5^(2-1-0) = 0.5
  // Transitions from i1: i2 (prob 0.5), i4 (prob 0.5).
  // Item "i2" at index 1 weight = 0.5^(2-1-1) = 1.0
  // Transitions from i2: i3 (prob 1.0).
  // Candidate scores (excluding session items "i1", "i2"):
  // i3: 1.0 * (1/1) = 1.0
  // i4: 0.5 * (1/2) = 0.25
  const recs = recommender.recommendSession(["i1", "i2"], {
    sessionStrategy: "transition",
    decayFactor: 0.5,
    explain: true,
  });

  assert.strictEqual(recs.length, 2);
  assert.strictEqual(recs[0]?.itemId, "i3");
  assert.strictEqual(recs[0]?.score, 1.0);
  assert.strictEqual(recs[1]?.itemId, "i4");
  assert.strictEqual(recs[1]?.score, 0.25);

  // Check explanations
  assert.ok(recs[0]?.reasons);
  assert.strictEqual(recs[0]?.reasons[0]?.triggerItemId, "i2");
  assert.strictEqual(recs[0]?.reasons[0]?.explanation, "Because it frequently follows item i2 in shopping patterns");

  assert.ok(recs[1]?.reasons);
  assert.strictEqual(recs[1]?.reasons[0]?.triggerItemId, "i1");
  assert.strictEqual(recs[1]?.reasons[0]?.explanation, "Because it frequently follows item i1 in shopping patterns");
});

test("Session-Based - recommendSession similarity-based strategy", () => {
  const recommender = new NanoRecommender();
  
  recommender.load([
    // User 1 likes i1, i2, and i3
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 5.0 },
    { userId: "u1", itemId: "i3", rating: 5.0 },
    // User 2 likes i2 and i4
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i4", rating: 4.0 },
  ]);

  // Session: ["i1"]
  // Recommend should find items similar to i1 (which is i2 and i3 from u1's pattern)
  // i4 is not very similar to i1 since there is no overlapping user between i1 and i4.
  const recs = recommender.recommendSession(["i1"], {
    sessionStrategy: "similarity",
    similarityStrategy: "item-based",
    explain: true,
  });

  assert.ok(recs.length > 0);
  assert.ok(recs.some(r => r.itemId === "i3"));
  assert.ok(recs.some(r => r.itemId === "i2"));

  // Check reasons format
  const i3Rec = recs.find(r => r.itemId === "i3");
  assert.ok(i3Rec?.reasons);
  assert.strictEqual(i3Rec.reasons[0]?.triggerItemId, "i1");
  assert.strictEqual(i3Rec.reasons[0]?.explanation, "Because it is similar to item i1 in your current session");
});

test("Session-Based - Auto-session detection with useSession", () => {
  const recommender = new NanoRecommender();
  
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, timestamp: 1000 },
    { userId: "u1", itemId: "i2", rating: 4.0, timestamp: 2000 },
    { userId: "u2", itemId: "i2", rating: 5.0, timestamp: 1000 },
    { userId: "u2", itemId: "i3", rating: 5.0, timestamp: 2000 },
  ]);

  // User 1 has history: ["i1", "i2"].
  // recommend("u1", { useSession: true, sessionStrategy: "transition" })
  // should detect session ["i1", "i2"] and transition to "i3" (since u2 transitioned i2 -> i3)
  const recs = recommender.recommend("u1", {
    useSession: true,
    sessionStrategy: "transition",
  });

  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i3");
});

test("Session-Based - Export and import states", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, timestamp: 1000 },
    { userId: "u1", itemId: "i2", rating: 4.0, timestamp: 2000 },
  ]);

  const state = recommender.export();

  const otherRecommender = new NanoRecommender();
  otherRecommender.import(state);

  // Validate transitions are correctly imported by recommending
  const recs = otherRecommender.recommendSession(["i1"], { sessionStrategy: "transition" });
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i2");
});

test("Session-Based - Validation and error handling", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
  ]);

  // Invalid sessionItemIds array
  assert.throws(() => {
    recommender.recommendSession(null as any);
  }, ValidationError);

  // Empty sessionItemIds array
  assert.throws(() => {
    recommender.recommendSession([]);
  }, ValidationError);

  // Item not in catalog
  assert.throws(() => {
    recommender.recommendSession(["non-existent"]);
  }, ValidationError);

  // Unknown strategy
  assert.throws(() => {
    recommender.recommendSession(["i1"], { sessionStrategy: "unknown" as any });
  }, ValidationError);

  // Invalid decay factor
  assert.throws(() => {
    recommender.recommendSession(["i1"], { decayFactor: -0.5 });
  }, ValidationError);
  assert.throws(() => {
    recommender.recommendSession(["i1"], { decayFactor: 1.5 });
  }, ValidationError);

  // Invalid similarity strategy
  assert.throws(() => {
    recommender.recommendSession(["i1"], { similarityStrategy: "unknown" as any });
  }, ValidationError);
});
