/**
 * Debug script v2: analyze LSH match-count distribution for top-K recall.
 * Key question: are exact top-10 items in the top-150 by match count?
 */
import { NanoRecommender } from "../src/recommender.js";
import { generateSyntheticData } from "./generator.js";

async function main() {
  const NUM_USERS = 1000;
  const NUM_ITEMS = 500;
  console.log(`\nGenerating dataset: ${NUM_USERS} users × ${NUM_ITEMS} items...`);
  const interactions = generateSyntheticData(NUM_USERS, NUM_ITEMS, 10, "variable");

  // Build exact recommender
  const exactRec = new NanoRecommender({ maxSimilarityCacheSize: 100000 });
  exactRec.load(interactions);

  // Find power user
  const allUserIds: string[] = (exactRec as any).matrix.getUserIds();
  const userSizes = allUserIds.map((u: string) => ({
    userId: u,
    size: (exactRec as any).matrix.getUserVector(u)?.size ?? 0,
  }));
  userSizes.sort((a, b) => b.size - a.size);
  const powerUser = userSizes[0]!.userId;
  console.log(`Power user: ${powerUser} (${userSizes[0]!.size} interactions)`);

  // Exact top-10
  const exactRecs = exactRec.recommend(powerUser, { strategy: "item-based", limit: 10 });
  const exactIds = new Set(exactRecs.map(r => r.itemId));
  console.log(`Exact top-10: ${[...exactIds].join(", ")}`);

  // Build LSH recommender (24×4)
  const lshRec = new NanoRecommender({
    maxSimilarityCacheSize: 100000,
    enableApproximateSearch: true,
    lshBands: 24,
    lshRows: 4,
    lshMinBandMatches: 1,
  });
  lshRec.load(interactions);

  const matrix = (lshRec as any).matrix;

  // Manually compute match counts for all candidates (mimicking findCandidateItemsLsh)
  const userVec = matrix.getUserVector(powerUser);
  const queryItems = (Array.from(userVec.entries()) as [any, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(e => e[0]);

  const matchCounts = new Map<string, number>();
  for (const itemId of queryItems) {
    const candidates: Set<any> = matrix.getItemLshCandidatesInternal(itemId, 1);
    for (const c of candidates) {
      const externalId = matrix.getOriginalItemId(c);
      matchCounts.set(externalId, (matchCounts.get(externalId) ?? 0) + 1);
    }
  }

  const sorted = Array.from(matchCounts.entries()).sort((a, b) => b[1] - a[1]);
  
  console.log(`\nTotal candidates: ${sorted.length}`);
  console.log(`Match count range: ${sorted[sorted.length-1]![1]} - ${sorted[0]![1]}`);

  // Check where exact top-10 items appear in the ranking
  console.log(`\nExact top-10 item positions in match-count ranking:`);
  for (const exactId of exactIds) {
    const pos = sorted.findIndex(([id]) => id === exactId);
    const count = matchCounts.get(exactId) ?? 0;
    console.log(`  ${exactId}: rank #${pos + 1} / ${sorted.length}, match_count=${count}`);
  }

  // Distribution analysis
  const maxCount = sorted[0]![1];
  const buckets = new Map<number, number>();
  for (const [, count] of sorted) {
    buckets.set(count, (buckets.get(count) ?? 0) + 1);
  }
  console.log(`\nMatch count distribution:`);
  for (const [count, numItems] of Array.from(buckets.entries()).sort((a, b) => b[0] - a[0]).slice(0, 15)) {
    const inExact = sorted.filter(([, c]) => c === count).filter(([id]) => exactIds.has(id)).length;
    console.log(`  count=${count}: ${numItems} items  ${inExact > 0 ? `(${inExact} exact top-10!)` : ""}`);
  }

  // Simulate top-K for different K values
  console.log(`\nRecall@10 vs topK:`);
  for (const K of [50, 100, 150, 200, 300, 500]) {
    const topK = new Set(sorted.slice(0, K).map(([id]) => id));
    const recall = [...exactIds].filter(id => topK.has(id)).length;
    console.log(`  topK=${K}: recall=${recall}/10 (${recall * 10}%), unique candidates=${topK.size}`);
  }

  // Test LSH rec at various topK values by varying lshMinBandMatches 
  // (higher minMatches = fewer, more-selective candidates)
  console.log(`\nLSH recall vs lshMinBandMatches (effective topK via minMatches filtering):`);
  for (const mm of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const testRec = new NanoRecommender({
      maxSimilarityCacheSize: 100000,
      enableApproximateSearch: true,
      lshBands: 24,
      lshRows: 4,
      lshMinBandMatches: mm,
    });
    testRec.load(interactions);
    
    // Count candidates manually
    const testMatrix = (testRec as any).matrix;
    const testUserVec = testMatrix.getUserVector(powerUser);
    const testQueryItems = (Array.from(testUserVec.entries()) as [any, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(e => e[0]);
    
    const testCandidates = new Set<string>();
    for (const itemId of testQueryItems) {
      const cands: Set<any> = testMatrix.getItemLshCandidatesInternal(itemId, mm);
      for (const c of cands) testCandidates.add(testMatrix.getOriginalItemId(c));
    }

    const recs = testRec.recommend(powerUser, {
      strategy: "item-based",
      limit: 10,
      enableApproximateSearch: true,
      lshMinBandMatches: mm,
    });
    const recall = recs.filter(r => exactIds.has(r.itemId)).length;
    console.log(`  minMatches=${mm}: ${testCandidates.size} raw candidates, recall=${recall}/10`);
  }
}

main().catch(console.error);
