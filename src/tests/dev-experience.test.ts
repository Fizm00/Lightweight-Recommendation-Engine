import test from "node:test";
import assert from "node:assert";
import { NanoRecommender, PRESETS } from "../recommender.js";
import { ValidationError } from "../errors/index.js";

test("Dev Experience - Configuration Presets", () => {
  // 1. Verify PRESETS content
  assert.ok(PRESETS.ecommerce);
  assert.ok(PRESETS.media);
  assert.strictEqual(PRESETS.ecommerce.defaultStrategy, "hybrid");
  assert.strictEqual(PRESETS.media.defaultStrategy, "item-based");

  // 2. Instantiate with ecommerce preset
  const recEc = new NanoRecommender("ecommerce");
  assert.strictEqual(recEc["defaultStrategy"], "hybrid");
  assert.strictEqual(recEc["defaultFallback"], "most-purchased");
  assert.strictEqual(recEc["defaultThreshold"], 0.1);
  assert.strictEqual(recEc["defaultMinIntersectionSize"], 2);
  assert.strictEqual(recEc["defaultK"], 50);
  assert.strictEqual(recEc["defaultHybridAlpha"], 0.7);
  assert.strictEqual(recEc["interactionWeights"]?.purchase, 3.0);

  // 3. Instantiate with media preset
  const recMedia = new NanoRecommender("media");
  assert.strictEqual(recMedia["defaultStrategy"], "item-based");
  assert.strictEqual(recMedia["defaultFallback"], "most-viewed");
  assert.strictEqual(recMedia["defaultThreshold"], 0.05);
  assert.strictEqual(recMedia["defaultMinIntersectionSize"], 1);
  assert.strictEqual(recMedia["defaultK"], 100);
  assert.strictEqual(recMedia["decayHalfLifeDays"], 30);
  assert.strictEqual(recMedia["interactionWeights"]?.watch, 2.0);

  // 4. Test static fromPreset helper with overrides
  const recEcOverridden = NanoRecommender.fromPreset("ecommerce", {
    defaultStrategy: "user-based",
    defaultK: 20,
  });
  assert.strictEqual(recEcOverridden["defaultStrategy"], "user-based");
  assert.strictEqual(recEcOverridden["defaultK"], 20);
  assert.strictEqual(recEcOverridden["defaultThreshold"], 0.1); // Inherited from preset

  // 5. Test invalid preset string
  assert.throws(() => {
    new NanoRecommender("unknown-preset" as any);
  }, ValidationError);
});

test("Dev Experience - Builder API", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 4 },
    { userId: "u2", itemId: "i1", rating: 4 },
    { userId: "u2", itemId: "i3", rating: 5 },
  ];
  recommender.load(dataset);

  // Test RecommendationQueryBuilder chain and execute
  const recs = recommender.query("u1")
    .withStrategy("item-based")
    .withLimit(2)
    .withSimilarityThreshold(0.0)
    .withMinIntersectionSize(1)
    .withK(10)
    .explain(true)
    .excludeItemIds(["i1"])
    .withFilter((itemId) => itemId !== "i2")
    .execute();

  assert.ok(Array.isArray(recs));
  assert.ok(recs.length <= 2);
  // i1 is excluded, user u1 already interacted with i2, so recommendations should contain i3
  assert.ok(recs.some(r => r.itemId === "i3"));

  // Test SessionRecommendationQueryBuilder chain and execute
  const sessionRecs = recommender.querySession(["i1", "i2"])
    .withLimit(1)
    .withSessionStrategy("similarity")
    .withSessionSimilarityStrategy("item-based")
    .execute();

  assert.ok(Array.isArray(sessionRecs));
  assert.ok(sessionRecs.length <= 1);
});

test("Dev Experience - API Observability metrics()", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
  });

  const dataset = [
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 4 },
    { userId: "u2", itemId: "i1", rating: 4 },
    { userId: "u2", itemId: "i3", rating: 5 },
  ];
  recommender.load(dataset);

  // Initial metrics (caches are empty)
  const m1 = recommender.metrics();
  assert.strictEqual(m1.cacheHitRate, 0.0);
  assert.strictEqual(m1.cacheDetails.itemCache.size, 0);
  assert.strictEqual(m1.stats.userCount, 2);

  // Trigger query to populate cache
  recommender.recommend("u1", { similarityThreshold: 0.0 });

  // Post-query metrics (caches are populated)
  const m2 = recommender.metrics();
  assert.ok(m2.cacheDetails.itemCache.size > 0);
  assert.ok(typeof m2.cacheHitRate === "number");

  if (m2.memoryUsage) {
    assert.ok(m2.memoryUsage.heapUsed > 0);
    assert.ok(m2.memoryUsage.heapTotal > 0);
  }
});

test("Dev Experience - Strategy Auto-routing", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "auto",
    defaultFallbackStrategy: "most-rated",
  });

  const dataset = [
    // 1. Cold start items/users (uCold will have 0)
    // 2. Sparse items with category/tags
    { userId: "uSparse", itemId: "i1", rating: 5, itemCategory: "catA", itemTags: ["tagA"] },
    // 3. User with multi-category preference (user-based CF auto-routed)
    { userId: "uMulti", itemId: "i1", rating: 5, itemCategory: "catA" },
    { userId: "uMulti", itemId: "i2", rating: 4, itemCategory: "catB" },
    { userId: "uMulti", itemId: "i3", rating: 4, itemCategory: "catC" },
    { userId: "uMulti", itemId: "i4", rating: 5, itemCategory: "catD" },
    { userId: "uMulti", itemId: "i5", rating: 3, itemCategory: "catE" },
    // 4. User with focused category preference (item-based CF auto-routed)
    { userId: "uFocus", itemId: "i11", rating: 5, itemCategory: "catA" },
    { userId: "uFocus", itemId: "i12", rating: 4, itemCategory: "catA" },
    { userId: "uFocus", itemId: "i13", rating: 4, itemCategory: "catA" },
    { userId: "uFocus", itemId: "i14", rating: 5, itemCategory: "catA" },
    { userId: "uFocus", itemId: "i15", rating: 3, itemCategory: "catA" },
    // Add some other users/ratings to build similarity
    { userId: "other1", itemId: "i1", rating: 4, itemCategory: "catA" },
    { userId: "other1", itemId: "i2", rating: 5, itemCategory: "catB" },
    { userId: "other1", itemId: "i3", rating: 3, itemCategory: "catC" },
    { userId: "other1", itemId: "i6", rating: 4, itemCategory: "catF" },
    { userId: "other2", itemId: "i11", rating: 5, itemCategory: "catA" },
    { userId: "other2", itemId: "i12", rating: 4, itemCategory: "catA" },
    { userId: "other2", itemId: "i16", rating: 3, itemCategory: "catA" },
  ];
  recommender.load(dataset);

  // Case 1: Cold start user (0 interactions)
  // uCold does not exist in train set. Auto-routing should fall back to most-rated
  const recsCold = recommender.recommend("uCold", { explain: true, limit: 1 });
  assert.ok(recsCold.length > 0);
  assert.strictEqual(recsCold[0]?.reasons?.[0]?.explanation, "One of the most rated items");

  // Case 2: Sparse user (1 <= N < 5) with metadata. Auto-routing should route to content-based
  const recsSparse = recommender.recommend("uSparse", { explain: true, limit: 10 });
  assert.ok(recsSparse.length > 0);
  // Verify that it used content-based explanation
  const hasContentExplanation = recsSparse.some(r =>
    r.reasons?.some(re => re.explanation.includes("similar content"))
  );
  assert.ok(hasContentExplanation, "Should auto-route sparse user with metadata to content-based CF");

  // Case 3: Moderate user (N >= 5) with multi-category preference. Auto-routing should route to user-based CF
  const recsMulti = recommender.recommend("uMulti", { explain: true, limit: 10 });
  assert.ok(recsMulti.length > 0);
  // Verify that it used user-based explanation
  const hasUserBasedExplanation = recsMulti.some(r =>
    r.reasons?.some(re => re.explanation.includes("Because similar user"))
  );
  assert.ok(hasUserBasedExplanation, "Should auto-route multi-category user to user-based CF");

  // Case 4: Moderate user (N >= 5) with focused category preference. Auto-routing should route to item-based CF
  const recsFocus = recommender.recommend("uFocus", { explain: true, limit: 10 });
  assert.ok(recsFocus.length > 0);
  // Verify that it used item-based explanation
  const hasItemBasedExplanation = recsFocus.some(r =>
    r.reasons?.some(re => re.explanation.includes("Because you liked item"))
  );
  assert.ok(hasItemBasedExplanation, "Should auto-route focused user to item-based CF");
});

test("Dev Experience - maxUserProfileSize Pruning", () => {
  const recommender = new NanoRecommender({
    maxUserProfileSize: 3,
  });

  recommender.addInteraction({ userId: "u1", itemId: "i1", rating: 5 });
  recommender.addInteraction({ userId: "u1", itemId: "i2", rating: 4 });
  recommender.addInteraction({ userId: "u1", itemId: "i3", rating: 3 });

  // Currently has 3 interactions for u1
  let stats = recommender.stats();
  assert.strictEqual(stats.interactionCount, 3);

  // Add a 4th interaction, which should trigger eviction of the oldest (i1)
  recommender.addInteraction({ userId: "u1", itemId: "i4", rating: 2 });

  stats = recommender.stats();
  // Total interaction count across all users/items is still 3 because i1 got evicted
  assert.strictEqual(stats.interactionCount, 3);

  // Check u1's vector in the matrix:
  const uIdx = recommender["matrix"].lookupInternalUser("u1");
  assert.ok(uIdx !== undefined);
  const userVector = recommender["matrix"].getUserVector(uIdx);
  assert.ok(userVector !== undefined);
  assert.strictEqual(userVector.size, 3);
  assert.ok(!userVector.has(recommender["matrix"].lookupInternalItem("i1")));
  assert.ok(userVector.has(recommender["matrix"].lookupInternalItem("i2")));
  assert.ok(userVector.has(recommender["matrix"].lookupInternalItem("i3")));
  assert.ok(userVector.has(recommender["matrix"].lookupInternalItem("i4")));
});

test("Dev Experience - Explanation Formatter (i18n)", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "item-based",
    explanationFormatter: (reason) => {
      // Custom localized formatter
      if (reason.triggerItemId) {
        return `Karena Anda menyukai produk ${reason.triggerItemId} (Skor: ${reason.similarity.toFixed(2)})`;
      }
      return reason.explanation;
    }
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5 },
    { userId: "u1", itemId: "i2", rating: 4 },
    { userId: "u2", itemId: "i1", rating: 5 },
    { userId: "u2", itemId: "i3", rating: 4 },
  ]);

  const recs = recommender.recommend("u1", { explain: true });
  assert.ok(recs.length > 0);
  const firstRec = recs[0];
  assert.ok(firstRec);
  assert.ok(firstRec.reasons && firstRec.reasons.length > 0);
  const explanation = firstRec.reasons[0]?.explanation;
  assert.ok(explanation);
  assert.ok(explanation.startsWith("Karena Anda menyukai produk i1"));

  // Override formatter in query options
  const recsQueryOverride = recommender.recommend("u1", {
    explain: true,
    explanationFormatter: (reason) => {
      if (reason.triggerItemId) {
        return `Trigger: ${reason.triggerItemId}`;
      }
      return reason.explanation;
    }
  });
  assert.ok(recsQueryOverride.length > 0);
  const firstOverride = recsQueryOverride[0];
  assert.ok(firstOverride);
  assert.strictEqual(firstOverride.reasons?.[0]?.explanation, "Trigger: i1");
});

test("Dev Experience - WASM Strategy and Auto-routing", async () => {
  const { shouldWasmAccelerate, setWasmStrategy, setWasmMinVectorSize, loadWasm } = await import("../wasm/loader.js");

  // Load WASM to ensure isLoaded is true
  await loadWasm();

  const vec1 = new Map<any, number>([[1, 5], [2, 4]]);
  const vec2 = new Map<any, number>([[1, 5], [2, 4], [3, 3], [4, 2], [5, 1]]);

  // 1. auto with wasmMinVectorSize = 5
  setWasmStrategy("auto");
  setWasmMinVectorSize(5);

  // one vector size is 2 < 5, so should be false
  assert.strictEqual(shouldWasmAccelerate(vec1, vec2), false);

  // both vectors have size >= 5
  const vec3 = new Map<any, number>([[1, 5], [2, 4], [3, 3], [4, 2], [5, 1], [6, 2]]);
  assert.strictEqual(shouldWasmAccelerate(vec2, vec3), true);

  // 2. always strategy
  setWasmStrategy("always");
  assert.strictEqual(shouldWasmAccelerate(vec1, vec2), true);

  // 3. never strategy
  setWasmStrategy("never");
  assert.strictEqual(shouldWasmAccelerate(vec2, vec3), false);

  // Reset strategy to auto
  setWasmStrategy("auto");
  setWasmMinVectorSize(20);
});

