import test from "node:test";
import assert from "node:assert";
import { NanoRecommender } from "../recommender.js";
import { computeContentSimilarity } from "../algorithms/content-based.js";
import { ValidationError } from "../errors/index.js";

test("Content-Based Similarity Math - computeContentSimilarity", () => {
  const recommender = new NanoRecommender();
  
  // Load data with items having different metadata
  recommender.load([
    // item 1: category & tags
    { userId: "u1", itemId: "i1", rating: 5, itemCategory: "Book", itemTags: ["fantasy", "fiction"] },
    // item 2: category & tags (perfect match category, tag intersection: 1/3)
    { userId: "u1", itemId: "i2", rating: 4, itemCategory: "Book", itemTags: ["fantasy", "sci-fi"] },
    // item 3: only category (no tags)
    { userId: "u2", itemId: "i3", rating: 5, itemCategory: "Book" },
    // item 4: only tags (no category)
    { userId: "u2", itemId: "i4", rating: 4, itemTags: ["fantasy", "fiction"] },
    // item 5: no category or tags
    { userId: "u3", itemId: "i5", rating: 3 },
  ]);

  const matrix = (recommender as any).matrix;

  // 1. Same item similarity
  assert.strictEqual(computeContentSimilarity(matrix, "i1", "i1"), 1.0);

  // 2. Both category and tags comparison
  // categorySim = 1.0 (both "Book")
  // tagSim = Jaccard("fantasy", "fiction" VS "fantasy", "sci-fi") = 1 / 3 = 0.3333333333333333
  // Default weight = 0.5 category, 0.5 tag
  // Expected similarity = 0.5 * 1.0 + 0.5 * (1/3) = 0.6666666666666666
  const sim1_2 = computeContentSimilarity(matrix, "i1", "i2");
  assert.ok(Math.abs(sim1_2 - 0.6666666666666666) < 1e-9);

  // 3. Category comparison only (automatic weight adjustment because i3 has no tags)
  // Expected: evaluates only category since tags are absent in i3.
  // Both are "Book", so expected similarity = 1.0
  const sim1_3 = computeContentSimilarity(matrix, "i1", "i3");
  assert.strictEqual(sim1_3, 1.0);

  // 4. Tags comparison only (automatic weight adjustment because i4 has no category)
  // Expected: Jaccard("fantasy", "fiction" VS "fantasy", "fiction") = 1.0
  const sim1_4 = computeContentSimilarity(matrix, "i1", "i4");
  assert.strictEqual(sim1_4, 1.0);

  // 5. Comparison involving item with no category or tags (i5)
  // Expected similarity = 0.0
  const sim1_5 = computeContentSimilarity(matrix, "i1", "i5");
  assert.strictEqual(sim1_5, 0.0);
});

test("Content-Based Strategy - Constructor Configurations & Validations", () => {
  // Invalid default category weight
  assert.throws(() => {
    new NanoRecommender({ defaultContentCategoryWeight: -0.1 });
  }, ValidationError);

  assert.throws(() => {
    new NanoRecommender({ defaultContentCategoryWeight: 1.1 });
  }, ValidationError);

  // Invalid default tag weight
  assert.throws(() => {
    new NanoRecommender({ defaultContentTagWeight: 1.5 });
  }, ValidationError);

  // Non-sum to 1.0 when both are provided
  assert.throws(() => {
    new NanoRecommender({
      defaultContentCategoryWeight: 0.4,
      defaultContentTagWeight: 0.7,
    });
  }, ValidationError);

  // Valid automatic adjustment of single weight
  const rec1 = new NanoRecommender({ defaultContentCategoryWeight: 0.3 });
  assert.strictEqual((rec1 as any).defaultContentCategoryWeight, 0.3);
  assert.strictEqual((rec1 as any).defaultContentTagWeight, 0.7);

  const rec2 = new NanoRecommender({ defaultContentTagWeight: 0.2 });
  assert.strictEqual((rec2 as any).defaultContentCategoryWeight, 0.8);
  assert.strictEqual((rec2 as any).defaultContentTagWeight, 0.2);
});

test("Content-Based Strategy - Query Option Validations", () => {
  const recommender = new NanoRecommender();
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5, itemCategory: "Book", itemTags: ["tag1"] },
  ]);

  // Invalid weights
  assert.throws(() => {
    recommender.recommend("u1", { strategy: "content-based", categoryWeight: -0.5 });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", { strategy: "content-based", tagWeight: 1.5 });
  }, ValidationError);

  assert.throws(() => {
    recommender.recommend("u1", {
      strategy: "content-based",
      categoryWeight: 0.4,
      tagWeight: 0.8,
    });
  }, ValidationError);
});

test("Content-Based Strategy - Recommendation Engine Execution", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "content-based",
  });

  // User u1 has liked item i1
  // We want to predict score for candidates i2 and i3
  // i2 has same category "Book" and same tag "fantasy"
  // i3 has category "Movie" and tag "action" (no match with i1)
  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i2", rating: 4.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i3", rating: 3.0, itemCategory: "Movie", itemTags: ["action"] },
  ]);

  const recs = recommender.recommend("u1");

  // i2 should be recommended, i3 shouldn't be recommended because similarity is 0.0
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0]?.itemId, "i2");
  // Expected similarity of i1-i2 = 1.0 (both category & tags match)
  // Expected score = user rating of i1 * similarity / similarity = 5.0 * 1.0 / 1.0 = 5.0
  assert.strictEqual(recs[0]?.score, 5.0);
});

test("Content-Based Strategy - Explain Option", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "content-based",
    defaultExplain: true,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 4.5, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i2", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy", "fiction"] },
  ]);

  const recs = recommender.recommend("u1");
  assert.strictEqual(recs.length, 1);
  const rec = recs[0];
  assert.strictEqual(rec?.itemId, "i2");
  assert.ok(rec?.reasons && rec.reasons.length > 0);
  
  const reason = rec.reasons[0]!;
  assert.strictEqual(reason.triggerItemId, "i1");
  // categorySim = 1.0, tagSim = 0.5 -> overall sim = 0.75
  assert.strictEqual(reason.similarity, 0.75);
  assert.strictEqual(reason.ratingGiven, 4.5);
  assert.ok(reason.explanation.includes("i1"));
  assert.ok(reason.explanation.includes("similar content"));
});

test("Content-Aware Hybrid Strategy - CF + CB Blending", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
    defaultHybridAlpha: 0.5,
  });

  // Target user u1 rated i1 (rating 5.0)
  // Candidate items: i2 and i3
  // Collaborative Filtering (Item-based) similarities (via shared user u2):
  // - i1-i2: u2 rated both (i1 rating 5.0, i2 rating 5.0) -> high CF score
  // - i1-i3: u2 rated i1 (5.0), u3 rated i3 (5.0). No shared users -> 0 CF score
  // Content similarities:
  // - i1-i2: different category, no common tags -> 0 content score
  // - i1-i3: same category "Book", same tags -> high content score
  recommender.load([
    // Target user
    { userId: "u1", itemId: "i1", rating: 5.0, type: "rate", itemCategory: "Book", itemTags: ["fantasy"] },
    
    // CF helper for i2
    { userId: "u2", itemId: "i1", rating: 5.0, type: "rate", itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i2", rating: 5.0, type: "rate", itemCategory: "Movie", itemTags: ["sci-fi"] },

    // Content-only helper for i3 (no user shares ratings with i3 except u3 who rated nothing else)
    { userId: "u3", itemId: "i3", rating: 4.0, type: "rate", itemCategory: "Book", itemTags: ["fantasy"] },
  ]);

  // 1. Pure CF (hybridAlpha = 1.0) -> should only recommend i2
  const recsCf = recommender.recommend("u1", {
    hybridAlpha: 1.0,
    hybridPopularityStrategy: "content-based", // blend with content-based
  });
  assert.strictEqual(recsCf.length, 1);
  assert.strictEqual(recsCf[0]?.itemId, "i2");

  // 2. Pure CB (hybridAlpha = 0.0) -> should only recommend i3 (since i2 has 0 similarity content-wise)
  const recsCb = recommender.recommend("u1", {
    hybridAlpha: 0.0,
    hybridPopularityStrategy: "content-based",
  });
  assert.strictEqual(recsCb.length, 1);
  assert.strictEqual(recsCb[0]?.itemId, "i3");

  // 3. Balanced Blended CF + CB (hybridAlpha = 0.5) -> should recommend both
  const recsHybrid = recommender.recommend("u1", {
    hybridAlpha: 0.5,
    hybridPopularityStrategy: "content-based",
  });
  assert.strictEqual(recsHybrid.length, 2);
});

test("Content-Aware Hybrid Strategy - Combined Explanations", () => {
  const recommender = new NanoRecommender({
    defaultStrategy: "hybrid",
    defaultHybridAlpha: 0.5,
  });

  recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    // u2 provides CF connection to i2
    { userId: "u2", itemId: "i1", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
    { userId: "u2", itemId: "i2", rating: 5.0, itemCategory: "Book", itemTags: ["fantasy"] },
  ]);

  // When explain is true, reasons from both CF and CB should be collected
  const recs = recommender.recommend("u1", {
    hybridPopularityStrategy: "content-based",
    explain: true,
  });

  assert.strictEqual(recs.length, 1);
  const rec = recs[0]!;
  assert.ok(rec.reasons && rec.reasons.length > 0);
  
  // Since i1-i2 has both CF and CB similarity, reasons from both should be present!
  const explanations = rec.reasons.map(r => r.explanation);
  assert.ok(explanations.some(e => e.includes("liked item i1"))); // CF reason
  assert.ok(explanations.some(e => e.includes("similar content"))); // CB reason
});
