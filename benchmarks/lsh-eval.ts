/**
 * Realistic ANN benchmark — production scenario.
 *
 * Key design decisions:
 *  - maxUserProfileSize: 50 (caps power users, production recommendation)
 *  - Dataset: 10k users × 3k items (fast to run, still representative)
 *  - Cache warm-up: only for the SAME users being benchmarked (not a full sweep)
 *  - Multi-run measurement for stable results
 */
import { NanoRecommender } from "../src/recommender.js";
import { generateSyntheticData } from "./generator.js";

type Rec = ReturnType<typeof generateSyntheticData>[number];

function build(interactions: Rec[], extra: Record<string, unknown> = {}): NanoRecommender {
  const rec = new NanoRecommender({
    maxSimilarityCacheSize: 200000,
    maxUserProfileSize: 50,
    ...extra,
  });
  rec.load(interactions);
  return rec;
}

function latencies(rec: NanoRecommender, userIds: string[], opts: Record<string, unknown> = {}, runs = 3): {
  avg: number; p95: number; p99: number;
} {
  const times: number[] = [];
  for (let r = 0; r < runs; r++) {
    for (const uid of userIds) {
      const t0 = performance.now();
      rec.recommend(uid, { strategy: "item-based", limit: 10, ...opts });
      times.push(performance.now() - t0);
    }
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    avg: sum / times.length,
    p95: times[Math.floor(times.length * 0.95)] ?? 0,
    p99: times[Math.floor(times.length * 0.99)] ?? 0,
  };
}

function recall(rec: NanoRecommender, gt: Map<string, string[]>, opts: Record<string, unknown> = {}): number {
  let total = 0, count = 0;
  for (const [uid, exact] of gt.entries()) {
    if (!exact.length) continue;
    const recs = rec.recommend(uid, { strategy: "item-based", limit: 10, ...opts });
    const set = new Set(recs.map(r => r.itemId));
    total += exact.filter(id => set.has(id)).length / exact.length;
    count++;
  }
  return count ? total / count : 0;
}

async function main() {
  const NUM_USERS = 10000;
  const NUM_ITEMS = 3000;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Realistic ANN Benchmark: ${NUM_USERS} users × ${NUM_ITEMS} items`);
  console.log(`Settings: maxUserProfileSize=50 | cache=200K | 3× measurement runs`);
  console.log("=".repeat(70));

  console.log("\nGenerating dataset (variable density)...");
  const interactions = generateSyntheticData(NUM_USERS, NUM_ITEMS, 10, "variable");
  console.log(`  ${interactions.length} total interactions`);

  // Count raw interactions per user (before capping)
  const rawCount = new Map<string, number>();
  for (const ia of interactions) rawCount.set(ia.userId, (rawCount.get(ia.userId) ?? 0) + 1);

  // Build reference recommender to get stable user list
  const refRec = build(interactions);
  const allUsers: string[] = (refRec as any).matrix.getUserIds();
  const sorted = allUsers
    .map(u => ({ u, cnt: rawCount.get(u) ?? 0 }))
    .sort((a, b) => b.cnt - a.cnt);

  // Power users: originally 100 interactions → capped to 50 in recommender
  const powerUserIds = sorted.slice(0, 10).map(x => x.u);
  // Mid users: ~8-12 interactions
  const midIdx = Math.floor(allUsers.length * 0.45);
  const midUserIds = sorted.slice(midIdx, midIdx + 20).map(x => x.u);
  // Cold users: 3-5 interactions
  const coldIdx = Math.floor(allUsers.length * 0.8);
  const coldUserIds = sorted.slice(coldIdx, coldIdx + 20).map(x => x.u);

  console.log(`\n  Power users (${powerUserIds.length}): raw ${sorted[0]!.cnt} interactions → capped to 50`);
  console.log(`  Mid users   (${midUserIds.length}): ~${sorted[midIdx]!.cnt} interactions`);
  console.log(`  Cold users  (${coldUserIds.length}): ~${sorted[coldIdx]!.cnt} interactions`);

  // Compute ground truth with exact recommender (first run warms the cache)
  console.log("\n  Computing ground truth (exact, 1 warm + 3 measured runs)...");
  const powerGT = new Map<string, string[]>();
  const midGT = new Map<string, string[]>();
  const coldGT = new Map<string, string[]>();
  for (const [uid, gt] of [[...powerUserIds, ...midUserIds, ...coldUserIds].map(u => [u, refRec.recommend(u, { strategy: "item-based", limit: 10 }).map(r => r.itemId)])]) {
    // noop — just warming
  }
  for (const uid of powerUserIds) powerGT.set(uid, refRec.recommend(uid, { strategy: "item-based", limit: 10 }).map(r => r.itemId));
  for (const uid of midUserIds) midGT.set(uid, refRec.recommend(uid, { strategy: "item-based", limit: 10 }).map(r => r.itemId));
  for (const uid of coldUserIds) coldGT.set(uid, refRec.recommend(uid, { strategy: "item-based", limit: 10 }).map(r => r.itemId));

  // ── POWER USERS ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log("POWER USERS — originally 100 interactions, capped to 50");
  console.log("─".repeat(70));

  // Exact cold cache
  {
    const rec = build(interactions);
    const lat = latencies(rec, powerUserIds, {}, 1);
    console.log(`  Exact  [cold]:  avg=${lat.avg.toFixed(1)}ms  P95=${lat.p95.toFixed(1)}ms  P99=${lat.p99.toFixed(1)}ms  Recall=100%`);
  }

  // Exact warm cache (1 warm pass + 3 measured)
  {
    const rec = build(interactions);
    latencies(rec, powerUserIds, {}, 1);  // warm
    const lat = latencies(rec, powerUserIds, {}, 3);
    console.log(`  Exact  [warm]:  avg=${lat.avg.toFixed(1)}ms  P95=${lat.p95.toFixed(1)}ms  P99=${lat.p99.toFixed(1)}ms  Recall=100%`);
  }

  // ANN cold cache
  {
    const rec = build(interactions, { enableApproximateSearch: true });
    const opts = { enableApproximateSearch: true };
    const lat = latencies(rec, powerUserIds, opts, 1);
    const rc = recall(rec, powerGT, opts);
    console.log(`  ANN    [cold]:  avg=${lat.avg.toFixed(1)}ms  P95=${lat.p95.toFixed(1)}ms  P99=${lat.p99.toFixed(1)}ms  Recall=${(rc*100).toFixed(0)}%`);
  }

  // ANN warm cache (1 warm pass + 3 measured)
  {
    const rec = build(interactions, { enableApproximateSearch: true });
    const opts = { enableApproximateSearch: true };
    latencies(rec, powerUserIds, opts, 1);  // warm
    const lat = latencies(rec, powerUserIds, opts, 3);
    const rc = recall(rec, powerGT, opts);
    console.log(`  ANN    [warm]:  avg=${lat.avg.toFixed(1)}ms  P95=${lat.p95.toFixed(1)}ms  P99=${lat.p99.toFixed(1)}ms  Recall=${(rc*100).toFixed(0)}%`);
  }

  // ── AVERAGE USERS ─────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log(`AVERAGE USERS — ~${sorted[midIdx]!.cnt} interactions`);
  console.log("─".repeat(70));

  {
    const rec = build(interactions);
    latencies(rec, midUserIds, {}, 1);
    const lat = latencies(rec, midUserIds, {}, 3);
    console.log(`  Exact  [warm]:  avg=${lat.avg.toFixed(2)}ms  P95=${lat.p95.toFixed(2)}ms  Recall=100%`);
  }
  {
    const rec = build(interactions, { enableApproximateSearch: true });
    const opts = { enableApproximateSearch: true };
    latencies(rec, midUserIds, opts, 1);
    const lat = latencies(rec, midUserIds, opts, 3);
    const rc = recall(rec, midGT, opts);
    console.log(`  ANN    [warm]:  avg=${lat.avg.toFixed(2)}ms  P95=${lat.p95.toFixed(2)}ms  Recall=${(rc*100).toFixed(0)}%`);
  }

  // ── COLD USERS ────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log(`COLD USERS — ~${sorted[coldIdx]!.cnt} interactions`);
  console.log("─".repeat(70));

  {
    const rec = build(interactions);
    latencies(rec, coldUserIds, {}, 1);
    const lat = latencies(rec, coldUserIds, {}, 3);
    console.log(`  Exact  [warm]:  avg=${lat.avg.toFixed(2)}ms  P95=${lat.p95.toFixed(2)}ms  Recall=100%`);
  }
  {
    const rec = build(interactions, { enableApproximateSearch: true });
    const opts = { enableApproximateSearch: true };
    latencies(rec, coldUserIds, opts, 1);
    const lat = latencies(rec, coldUserIds, opts, 3);
    const rc = recall(rec, coldGT, opts);
    console.log(`  ANN    [warm]:  avg=${lat.avg.toFixed(2)}ms  P95=${lat.p95.toFixed(2)}ms  Recall=${(rc*100).toFixed(0)}%`);
  }

  // ── COMBINED SUMMARY TABLE ────────────────────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY TABLE");
  console.log("─".repeat(70));
  console.log("| User Segment | Exact [warm] P95 | ANN [warm] P95 | Speedup | Recall |");
  console.log("| :--- | :---: | :---: | :---: | :---: |");

  const segments = [
    { label: "Power (capped 50)", userIds: powerUserIds, gt: powerGT },
    { label: "Average (~10 int)", userIds: midUserIds, gt: midGT },
    { label: "Cold (~3-5 int)", userIds: coldUserIds, gt: coldGT },
  ];

  for (const seg of segments) {
    const opts = { enableApproximateSearch: true };
    const recEx = build(interactions);
    latencies(recEx, seg.userIds, {}, 1);
    const latEx = latencies(recEx, seg.userIds, {}, 3);

    const recAnn = build(interactions, { enableApproximateSearch: true });
    latencies(recAnn, seg.userIds, opts, 1);
    const latAnn = latencies(recAnn, seg.userIds, opts, 3);
    const rc = recall(recAnn, seg.gt, opts);

    const speedup = latEx.p95 / (latAnn.p95 || 0.001);
    console.log(`| ${seg.label} | ${latEx.p95.toFixed(1)} ms | ${latAnn.p95.toFixed(1)} ms | ${speedup.toFixed(1)}x | ${(rc*100).toFixed(0)}% |`);
  }

  console.log(`\nANN formula: maxCoRatersPerItem = max(3, ceil(400 / profileSize))`);
  console.log(`  Power user (profile=50): samples 8 co-raters/item vs all ~36`);
  console.log(`  Avg user   (profile=10): samples 40 co-raters/item vs all ~36 (no sampling)`);
}

main().catch(console.error);
