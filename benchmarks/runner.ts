import { NanoRecommender } from "../src/recommender.js";
import { generateSyntheticData } from "./generator.js";
import type { Interaction } from "../src/types/index.js";

interface BenchmarkResult {
  readonly scale: string;
  readonly users: number;
  readonly items: number;
  readonly interactionsCount: number;
  readonly loadTimeMs: number;
  readonly loadOpsPerSec: number;
  readonly recCacheMissAvgMs: number;
  readonly recCacheMissP95Ms: number;
  readonly recCacheHitAvgMs: number;
  readonly recCacheHitP95Ms: number;
  readonly heapLoadedMb: number;
  readonly heapCachedMb: number;
}

/**
 * Invokes V8 garbage collector if --expose-gc flag is active.
 */
function triggerGC(): void {
  if (typeof globalThis !== "undefined" && (globalThis as any).gc) {
    (globalThis as any).gc();
  }
}

/**
 * Measures the load time and loaded items throughput.
 *
 * @param recommender NanoRecommender instance.
 * @param interactions List of synthetic interactions to load.
 */
function measureLoad(
  recommender: NanoRecommender,
  interactions: Interaction[]
): { readonly timeMs: number; readonly opsPerSec: number } {
  const t0 = performance.now();
  recommender.load(interactions);
  const timeMs = performance.now() - t0;
  const opsPerSec = interactions.length / (timeMs / 1000);
  return { timeMs, opsPerSec };
}

/**
 * Calculates current heap memory footprint relative to a baseline.
 *
 * @param baselineBytes Baseline memory in bytes.
 */
function measureHeapMb(baselineBytes: number): number {
  triggerGC();
  return (process.memoryUsage().heapUsed - baselineBytes) / 1024 / 1024;
}

/**
 * Samples deterministic target user IDs from the generated dataset.
 *
 * @param numUsers Total number of users generated.
 * @param sampleSize Size of the sampling list.
 */
function getSampleUserIds(numUsers: number, sampleSize = 100): string[] {
  const step = Math.max(1, Math.floor(numUsers / sampleSize));
  const sampleUserIds: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    sampleUserIds.push(`u_${(i * step) % numUsers}`);
  }
  return sampleUserIds;
}

/**
 * Measures recommendation latency stats over a list of users.
 *
 * @param recommender NanoRecommender instance.
 * @param userIds List of user IDs to request recommendations for.
 * @param strategy Filtering strategy to test.
 */
function benchmarkRecommendations(
  recommender: NanoRecommender,
  userIds: string[],
  strategy: "item-based" | "user-based"
): { readonly avgMs: number; readonly p95Ms: number } {
  const times: number[] = [];
  for (const userId of userIds) {
    const t0 = performance.now();
    recommender.recommend(userId, { strategy });
    const t1 = performance.now();
    times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const p95Idx = Math.floor(times.length * 0.95);
  return { avgMs: sum / times.length, p95Ms: times[p95Idx] ?? 0 };
}

/**
 * Runs the benchmark for a single scale configuration.
 */
function runScale(
  scaleName: string,
  numUsers: number,
  numItems: number,
  interactionsPerUser: number
): BenchmarkResult {
  triggerGC();
  const heapBaseline = process.memoryUsage().heapUsed;
  const interactions = generateSyntheticData(numUsers, numItems, interactionsPerUser);

  const recommender = new NanoRecommender();
  const load = measureLoad(recommender, interactions);
  const heapLoadedMb = measureHeapMb(heapBaseline);

  const sampleUserIds = getSampleUserIds(numUsers);
  const miss = benchmarkRecommendations(recommender, sampleUserIds, "item-based");
  const hit = benchmarkRecommendations(recommender, sampleUserIds, "item-based");
  const heapCachedMb = measureHeapMb(heapBaseline + heapLoadedMb * 1024 * 1024);

  return {
    scale: scaleName,
    users: numUsers,
    items: numItems,
    interactionsCount: interactions.length,
    loadTimeMs: load.timeMs,
    loadOpsPerSec: load.opsPerSec,
    recCacheMissAvgMs: miss.avgMs,
    recCacheMissP95Ms: miss.p95Ms,
    recCacheHitAvgMs: hit.avgMs,
    recCacheHitP95Ms: hit.p95Ms,
    heapLoadedMb,
    heapCachedMb,
  };
}

/**
 * Prints the results of the benchmark runner.
 *
 * @param results Calculated results.
 */
function printResultsTable(results: BenchmarkResult[]): void {
  console.log("\n## Benchmark Results - Loading & Memory Footprint");
  console.log("| Scale | Users | Items | Interactions | Load Time | Load Rate (Ops/sec) | Heap Delta (Loaded) | Heap Delta (Cached) |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |");
  for (const r of results) {
    console.log(
      `| ${r.scale} | ${r.users.toLocaleString()} | ${r.items.toLocaleString()} | ${r.interactionsCount.toLocaleString()} | ${r.loadTimeMs.toFixed(2)} ms | ${r.loadOpsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 })} | ${r.heapLoadedMb.toFixed(2)} MB | ${r.heapCachedMb.toFixed(2)} MB |`
    );
  }

  console.log("\n## Benchmark Results - Recommendation Latency (Item-Based)");
  console.log("| Scale | Cache-Miss Avg | Cache-Miss P95 | Cache-Hit Avg | Cache-Hit P95 | Speedup Factor |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: |");
  for (const r of results) {
    const speedup = r.recCacheMissAvgMs / (r.recCacheHitAvgMs || 0.001);
    console.log(
      `| ${r.scale} | ${r.recCacheMissAvgMs.toFixed(3)} ms | ${r.recCacheMissP95Ms.toFixed(3)} ms | ${r.recCacheHitAvgMs.toFixed(3)} ms | ${r.recCacheHitP95Ms.toFixed(3)} ms | ${speedup.toFixed(1)}x |`
    );
  }
}

/**
 * Main orchestrator of the benchmark.
 */
function main(): void {
  console.log("Starting Benchmark Suite for nano-recommender...");
  const results: BenchmarkResult[] = [];

  console.log("Running Scale: Small...");
  results.push(runScale("Small", 1000, 100, 10));

  console.log("Running Scale: Medium...");
  results.push(runScale("Medium", 10000, 1000, 10));

  console.log("Running Scale: Large...");
  results.push(runScale("Large", 100000, 5000, 10));

  printResultsTable(results);
}

main();
