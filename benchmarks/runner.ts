import os from "os";
import { NanoRecommender } from "../src/recommender.js";
import { generateSyntheticData } from "./generator.js";
import { setWasmEnabled } from "../src/wasm/loader.js";
import type { Interaction } from "../src/types/index.js";

interface StrategyLatency {
  readonly strategy: string;
  readonly avgMs: number;
  readonly p95Ms: number;
}

interface ScaleResult {
  readonly scale: string;
  readonly users: number;
  readonly items: number;
  readonly interactionsCount: number;
  readonly loadTimeMs: number;
  readonly loadOpsPerSec: number;
  readonly heapLoadedMb: number;
  readonly heapCachedMb: number;
  readonly wasmHitAvgMs: number;
  readonly wasmHitP95Ms: number;
  readonly wasmLatencies: Record<string, StrategyLatency>;
  readonly jsLatencies: Record<string, StrategyLatency>;
}

interface DensityResult {
  readonly scale: string;
  readonly densityMode: "uniform" | "variable" | "variable (capped at 50)";
  readonly interactionsCount: number;
  readonly avgMs: number;
  readonly p95Ms: number;
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
 */
function benchmarkRecommendations(
  recommender: NanoRecommender,
  userIds: string[],
  strategy: "item-based" | "user-based" | "hybrid" | "content-based" | "session-based"
): { readonly avgMs: number; readonly p95Ms: number } {
  const times: number[] = [];
  for (const userId of userIds) {
    const t0 = performance.now();
    if (strategy === "session-based") {
      recommender.recommendSession(["i_0", "i_1", "i_2"], { limit: 10 });
    } else {
      recommender.recommend(userId, { strategy, limit: 10 });
    }
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
): ScaleResult {
  triggerGC();
  const heapBaseline = process.memoryUsage().heapUsed;
  const interactions = generateSyntheticData(numUsers, numItems, interactionsPerUser, "uniform");

  const recommender = new NanoRecommender({ wasmStrategy: "always" });
  
  // Measure loading
  const t0 = performance.now();
  recommender.load(interactions);
  const loadTimeMs = performance.now() - t0;
  const loadOpsPerSec = interactions.length / (loadTimeMs / 1000);
  const heapLoadedMb = measureHeapMb(heapBaseline);

  const sampleUserIds = getSampleUserIds(numUsers);

  // 1. WASM Enabled Latencies
  setWasmEnabled(true);
  const wasmLatencies: Record<string, StrategyLatency> = {};
  const strategies: Array<"item-based" | "user-based" | "hybrid" | "content-based" | "session-based"> = [
    "item-based",
    "user-based",
    "hybrid",
    "content-based",
    "session-based",
  ];

  const resetRecommender = () => {
    recommender.clear();
    recommender.load(interactions);
  };

  // Warmup/Cache Miss & Hit test for Item-Based CF
  resetRecommender();
  const miss = benchmarkRecommendations(recommender, sampleUserIds, "item-based");
  const hit = benchmarkRecommendations(recommender, sampleUserIds, "item-based");
  const heapCachedMb = measureHeapMb(heapBaseline + heapLoadedMb * 1024 * 1024);
  wasmLatencies["item-based"] = { strategy: "item-based", avgMs: miss.avgMs, p95Ms: miss.p95Ms };

  // Other strategies
  for (const s of strategies) {
    if (s === "item-based") continue;
    resetRecommender();
    const lat = benchmarkRecommendations(recommender, sampleUserIds, s);
    wasmLatencies[s] = { strategy: s, avgMs: lat.avgMs, p95Ms: lat.p95Ms };
  }

  // 2. WASM Disabled (Pure JS) Latencies
  setWasmEnabled(false);
  const jsLatencies: Record<string, StrategyLatency> = {};
  for (const s of strategies) {
    resetRecommender();
    const lat = benchmarkRecommendations(recommender, sampleUserIds, s);
    jsLatencies[s] = { strategy: s, avgMs: lat.avgMs, p95Ms: lat.p95Ms };
  }

  // Restore Wasm enabled
  setWasmEnabled(true);

  return {
    scale: scaleName,
    users: numUsers,
    items: numItems,
    interactionsCount: interactions.length,
    loadTimeMs,
    loadOpsPerSec,
    heapLoadedMb,
    heapCachedMb,
    wasmHitAvgMs: hit.avgMs,
    wasmHitP95Ms: hit.p95Ms,
    wasmLatencies,
    jsLatencies,
  };
}

/**
 * Runs density benchmarks (Uniform vs. Variable/Power User).
 */
function runDensityBenchmark(
  scaleName: string,
  numUsers: number,
  numItems: number,
  interactionsPerUser: number
): DensityResult[] {
  const sampleUserIds = getSampleUserIds(numUsers);
  
  // Uniform
  const intUniform = generateSyntheticData(numUsers, numItems, interactionsPerUser, "uniform");
  const recUniform = new NanoRecommender();
  recUniform.load(intUniform);
  const latUniform = benchmarkRecommendations(recUniform, sampleUserIds, "item-based");

  // Variable (uncapped)
  const intVariable = generateSyntheticData(numUsers, numItems, interactionsPerUser, "variable");
  const recVariable = new NanoRecommender();
  recVariable.load(intVariable);
  const latVariable = benchmarkRecommendations(recVariable, sampleUserIds, "item-based");

  // Variable (capped at 50)
  const recVariableCapped = new NanoRecommender({ maxUserProfileSize: 50 });
  recVariableCapped.load(intVariable);
  const latVariableCapped = benchmarkRecommendations(recVariableCapped, sampleUserIds, "item-based");

  return [
    {
      scale: scaleName,
      densityMode: "uniform",
      interactionsCount: intUniform.length,
      avgMs: latUniform.avgMs,
      p95Ms: latUniform.p95Ms,
    },
    {
      scale: scaleName,
      densityMode: "variable",
      interactionsCount: intVariable.length,
      avgMs: latVariable.avgMs,
      p95Ms: latVariable.p95Ms,
    },
    {
      scale: scaleName,
      densityMode: "variable (capped at 50)",
      interactionsCount: recVariableCapped.stats().interactionCount,
      avgMs: latVariableCapped.avgMs,
      p95Ms: latVariableCapped.p95Ms,
    },
  ];
}

/**
 * Prints system environment specs.
 */
function printEnvironment(): void {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0]!.model : "Unknown CPU";
  const ramGb = os.totalmem() / 1024 / 1024 / 1024;
  console.log("\n## System Environment");
  console.log(`- **CPU**: ${cpuModel} (${cpus.length} cores)`);
  console.log(`- **RAM**: ${ramGb.toFixed(2)} GB`);
  console.log(`- **OS**: ${os.type()} (${os.arch()}, ${os.release()})`);
  console.log(`- **Node.js**: ${process.version}`);
}

/**
 * Prints the results of the benchmark runner.
 */
function printResultsTable(results: ScaleResult[], densityResults: DensityResult[]): void {
  console.log("\n## Benchmark Results - Loading & Memory Footprint");
  console.log("| Scale | Users | Items | Interactions | Load Time | Load Rate (Ops/sec) | Heap Delta (Loaded) | Heap Delta (Cached) |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |");
  for (const r of results) {
    console.log(
      `| ${r.scale} | ${r.users.toLocaleString()} | ${r.items.toLocaleString()} | ${r.interactionsCount.toLocaleString()} | ${r.loadTimeMs.toFixed(2)} ms | ${r.loadOpsPerSec.toLocaleString(undefined, { maximumFractionDigits: 0 })} | ${r.heapLoadedMb.toFixed(2)} MB | ${r.heapCachedMb.toFixed(2)} MB |`
    );
  }

  console.log("\n## Benchmark Results - Item-Based Latency (Cache Hit vs. Miss)");
  console.log("| Scale | Cache-Miss Avg | Cache-Miss P95 | Cache-Hit Avg | Cache-Hit P95 | Hit Speedup |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: |");
  for (const r of results) {
    const miss = r.wasmLatencies["item-based"]!;
    const speedup = miss.avgMs / (r.wasmHitAvgMs || 0.001);
    console.log(
      `| ${r.scale} | ${miss.avgMs.toFixed(3)} ms | ${miss.p95Ms.toFixed(3)} ms | ${r.wasmHitAvgMs.toFixed(3)} ms | ${r.wasmHitAvgMs.toFixed(3)} ms | ${speedup.toFixed(1)}x |`
    );
  }

  console.log("\n## Benchmark Results - WASM vs. JS Fallback Latency (Cache-Miss Avg)");
  console.log("| Scale | Strategy | JS Fallback (Avg) | WASM Enabled (Avg) | WASM Acceleration |");
  console.log("| :--- | :--- | :---: | :---: | :---: |");
  for (const r of results) {
    for (const key of Object.keys(r.wasmLatencies)) {
      const wasm = r.wasmLatencies[key]!;
      const js = r.jsLatencies[key]!;
      const accel = js.avgMs / (wasm.avgMs || 0.001);
      console.log(
        `| ${r.scale} | ${key} | ${js.avgMs.toFixed(3)} ms | ${wasm.avgMs.toFixed(3)} ms | ${accel.toFixed(2)}x |`
      );
    }
  }

  console.log("\n## Benchmark Results - Multi-Strategy Latency (WASM Enabled)");
  console.log("| Scale | Item-Based CF | User-Based CF | Hybrid Strategy | Content-Based | Session-Based |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: |");
  for (const r of results) {
    console.log(
      `| ${r.scale} | ${r.wasmLatencies["item-based"]!.avgMs.toFixed(3)} ms | ${r.wasmLatencies["user-based"]!.avgMs.toFixed(3)} ms | ${r.wasmLatencies["hybrid"]!.avgMs.toFixed(3)} ms | ${r.wasmLatencies["content-based"]!.avgMs.toFixed(3)} ms | ${r.wasmLatencies["session-based"]!.avgMs.toFixed(3)} ms |`
    );
  }

  console.log("\n## Benchmark Results - Density Impact (Uniform vs. Variable/Power User)");
  console.log("| Scale | Density Mode | Total Interactions | Latency Avg (Miss) | Latency P95 (Miss) |");
  console.log("| :--- | :--- | :---: | :---: | :---: |");
  for (const d of densityResults) {
    console.log(
      `| ${d.scale} | ${d.densityMode} | ${d.interactionsCount.toLocaleString()} | ${d.avgMs.toFixed(3)} ms | ${d.p95Ms.toFixed(3)} ms |`
    );
  }
}

/**
 * Main orchestrator of the benchmark.
 */
async function main(): Promise<void> {
  console.log("Starting Extended Benchmark Suite for nano-recommender...");
  
  // Ensure Wasm is loaded before running benchmarks
  const rec = new NanoRecommender();
  // Wait a short time for potential background compile to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  const results: ScaleResult[] = [];
  const densityResults: DensityResult[] = [];

  console.log("Running Scale: Small...");
  results.push(runScale("Small", 1000, 100, 10));
  densityResults.push(...runDensityBenchmark("Small", 1000, 100, 10));

  console.log("Running Scale: Medium...");
  results.push(runScale("Medium", 10000, 1000, 10));
  densityResults.push(...runDensityBenchmark("Medium", 10000, 1000, 10));

  console.log("Running Scale: Large...");
  results.push(runScale("Large", 100000, 5000, 10));
  densityResults.push(...runDensityBenchmark("Large", 100000, 5000, 10));

  printEnvironment();
  printResultsTable(results, densityResults);
}

main().catch(console.error);
