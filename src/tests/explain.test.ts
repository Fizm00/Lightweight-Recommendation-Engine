import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Explainable Recommendations - Configuration & Validation", () => {
  // Constructor config validation
  assert.throws(() => {
    new NanoRecommender({ defaultExplain: "true" as any });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultExplain: 123 as any });
  }, ValidationError);

  const recommender = new NanoRecommender({ defaultExplain: true });

  // Query options validation
  assert.throws(() => {
    recommender.recommend("u1", { explain: "yes" as any });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommendItemBased("u1", { explain: 123 as any });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommendUserBased("u1", { explain: null as any });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommendHybrid("u1", { explain: {} as any });
  }, ValidationError);
});

test("Explainable Recommendations - Item-Based CF", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    // i3 is similar to i1 (u2 rated both 5.0)
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 5.0 },
    // i4 is similar to i2 (u3 rated i2 3.0 and i4 3.0)
    { userId: "u3", itemId: "i2", rating: 3.0 },
    { userId: "u3", itemId: "i4", rating: 3.0 },
  ]);

  // Request recommendations with explain: true
  const recs = recommender.recommend("u1", { strategy: "item-based", explain: true });

  assert.ok(recs.length > 0);
  for (const rec of recs) {
    assert.ok(Array.isArray(rec.reasons), "reasons should be an array");
    assert.ok(rec.reasons!.length > 0, "reasons should not be empty");

    for (const reason of rec.reasons!) {
      assert.ok(typeof reason.triggerItemId === "string", "triggerItemId should be a string");
      assert.ok(typeof reason.similarity === "number", "similarity should be a number");
      assert.ok(typeof reason.ratingGiven === "number", "ratingGiven should be a number");
      assert.ok(reason.explanation.startsWith("Because you liked item"), "explanation format should be correct");
    }
  }

  // Check specific reason details for i3 (should be triggered by i1)
  const i3Rec = recs.find(r => r.itemId === "i3");
  assert.ok(i3Rec);
  const i3Reason = i3Rec!.reasons!.find(r => r.triggerItemId === "i1");
  assert.ok(i3Reason);
  assert.strictEqual(i3Reason!.ratingGiven, 5.0);
  assert.ok(i3Reason!.similarity > 0);
  assert.strictEqual(i3Reason!.explanation, "Because you liked item i1");

  // Request recommendations with explain: false (or default)
  const recsNoExplain = recommender.recommend("u1", { strategy: "item-based", explain: false });
  assert.ok(recsNoExplain.length > 0);
  for (const rec of recsNoExplain) {
    assert.strictEqual(rec.reasons, undefined, "reasons should be undefined when explain is false");
  }
});

test("Explainable Recommendations - User-Based CF", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    // Target user u1
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
    // Similar user u2 (shares i1 and i2, rates candidate i3)
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i2", rating: 4.0 },
    { userId: "u2", itemId: "i3", rating: 3.5 },
  ]);

  const recs = recommender.recommend("u1", { strategy: "user-based", explain: true });

  assert.ok(recs.length > 0);
  const i3Rec = recs.find(r => r.itemId === "i3");
  assert.ok(i3Rec);
  assert.ok(Array.isArray(i3Rec!.reasons));
  const u2Reason = i3Rec!.reasons!.find(r => r.triggerUserId === "u2");
  assert.ok(u2Reason);
  assert.strictEqual(u2Reason!.ratingGiven, 3.5);
  assert.ok(u2Reason!.similarity > 0);
  assert.strictEqual(u2Reason!.explanation, "Because similar user u2 rated it 3.5");
});

test("Explainable Recommendations - Popularity & Cold Start", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate" },
    { userId: "u1", itemId: "i1", rating: 1.0, type: "view" },
    { userId: "u1", itemId: "i1", rating: 1.0, type: "purchase" },
  ]);

  // Cold start user with explain: true
  const recsRated = recommender.recommend("uNew", { fallbackStrategy: "most-rated", explain: true });
  assert.ok(recsRated.length > 0);
  assert.strictEqual(recsRated[0]!.reasons![0]!.explanation, "One of the most rated items");

  const recsViewed = recommender.recommend("uNew", { fallbackStrategy: "most-viewed", explain: true });
  assert.ok(recsViewed.length > 0);
  assert.strictEqual(recsViewed[0]!.reasons![0]!.explanation, "One of the most viewed items");

  const recsPurchased = recommender.recommend("uNew", { fallbackStrategy: "most-purchased", explain: true });
  assert.ok(recsPurchased.length > 0);
  assert.strictEqual(recsPurchased[0]!.reasons![0]!.explanation, "One of the most purchased items");
});

test("Explainable Recommendations - Hybrid Strategy", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
    defaultHybridAlpha: 0.5,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i1", rating: 5.0 },
    { userId: "u2", itemId: "i3", rating: 4.5 },
  ]);

  const recs = recommender.recommend("u1", { explain: true });
  assert.ok(recs.length > 0);
  const i3Rec = recs.find(r => r.itemId === "i3");
  assert.ok(i3Rec);
  assert.ok(Array.isArray(i3Rec!.reasons));
  assert.ok(i3Rec!.reasons!.length > 0);
  assert.strictEqual(i3Rec!.reasons![0]!.triggerItemId, "i1");
  assert.strictEqual(i3Rec!.reasons![0]!.explanation, "Because you liked item i1");
});
