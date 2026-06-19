import initWasm, {
  cosine_similarity,
  jaccard_similarity,
  pearson_correlation,
  calculate_magnitude,
  calculate_dot_product,
  intersection_size
} from "./pkg/nano_recommender_wasm.js";
import { WASM_BASE64 } from "./wasm-binary.js";

let isLoaded = false;
let isEnabled = true;

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else if (typeof atob !== "undefined") {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } else {
    throw new Error("No base64 decoding function available in this environment.");
  }
}

/**
 * Dynamically loads and initializes the compiled Rust WebAssembly module.
 * Returns true if successful, false otherwise.
 */
export async function loadWasm(): Promise<boolean> {
  if (isLoaded) return true;

  try {
    const binary = decodeBase64(WASM_BASE64);
    await initWasm({ module_or_path: binary });
    isLoaded = true;
    return true;
  } catch (err) {
    console.warn("Failed to initialize WebAssembly backend, falling back to pure JS/TS:", err);
    return false;
  }
}

/**
 * Returns true if the WebAssembly module has been successfully loaded.
 */
export function isWasmLoaded(): boolean {
  return isLoaded && isEnabled;
}

/**
 * Dynamically enables or disables WebAssembly acceleration.
 */
export function setWasmEnabled(enabled: boolean): void {
  isEnabled = enabled;
}

let wasmStrategy: "auto" | "always" | "never" = "auto";
let wasmMinVectorSize = 20;

export function setWasmStrategy(strategy: "auto" | "always" | "never"): void {
  wasmStrategy = strategy;
}

export function getWasmStrategy(): "auto" | "always" | "never" {
  return wasmStrategy;
}

export function setWasmMinVectorSize(size: number): void {
  wasmMinVectorSize = size;
}

export function getWasmMinVectorSize(): number {
  return wasmMinVectorSize;
}

/**
 * Determines whether WebAssembly should be used to accelerate vector similarity calculations.
 */
export function shouldWasmAccelerate(
  vectorA: ReadonlyMap<any, number>,
  vectorB: ReadonlyMap<any, number>
): boolean {
  if (!isLoaded || !isEnabled) return false;
  if (wasmStrategy === "never") return false;
  if (wasmStrategy === "always") return true;

  // 'auto' strategy: fallback to JS if either vector is too small/sparse
  if (vectorA.size < wasmMinVectorSize || vectorB.size < wasmMinVectorSize) {
    return false;
  }
  return true;
}

export {
  cosine_similarity,
  jaccard_similarity,
  pearson_correlation,
  calculate_magnitude,
  calculate_dot_product,
  intersection_size
};

let wasmKeysCache = new WeakMap<ReadonlyMap<number | string, number>, Int32Array>();
let wasmValsCache = new WeakMap<ReadonlyMap<number | string, number>, Float64Array>();

const stringToIdx = new Map<string, number>();

export function clearWasmGlobalCache(): void {
  stringToIdx.clear();
  wasmKeysCache = new WeakMap();
  wasmValsCache = new WeakMap();
}

/**
 * Invalidates the cached WebAssembly typed arrays for a modified vector.
 */
export function invalidateVectorCache(v: ReadonlyMap<number | string, number>): void {
  wasmKeysCache.delete(v);
  wasmValsCache.delete(v);
}

function getWasmArrays(v: ReadonlyMap<number | string, number>): [Int32Array, Float64Array] {
  let keys = wasmKeysCache.get(v);
  let values = wasmValsCache.get(v);

  if (!keys || !values) {
    const entries = Array.from(v.entries()).map(([k, val]) => {
      let idx: number;
      if (typeof k === "number") {
        idx = k;
      } else {
        let mapped = stringToIdx.get(k);
        if (mapped === undefined) {
          mapped = stringToIdx.size;
          stringToIdx.set(k, mapped);
        }
        idx = mapped;
      }
      return [idx, val] as [number, number];
    });
    // Sort by integer key (super fast)
    entries.sort((a, b) => a[0] - b[0]);

    keys = new Int32Array(entries.length);
    values = new Float64Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      keys[i] = entries[i]![0];
      values[i] = entries[i]![1];
    }
    wasmKeysCache.set(v, keys);
    wasmValsCache.set(v, values);
  }
  return [keys, values];
}

/**
 * Converts two sparse vector maps to aligned, sorted Int32Array and Float64Array.
 */
export function mapToWasmVectors(
  v1: ReadonlyMap<number | string, number>,
  v2: ReadonlyMap<number | string, number>
): [Int32Array, Float64Array, Int32Array, Float64Array] {
  const [keysA, valuesA] = getWasmArrays(v1);
  const [keysB, valuesB] = getWasmArrays(v2);
  return [keysA, valuesA, keysB, valuesB];
}
