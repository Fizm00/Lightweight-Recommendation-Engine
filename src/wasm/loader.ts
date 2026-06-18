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
  return isLoaded;
}

export {
  cosine_similarity,
  jaccard_similarity,
  pearson_correlation,
  calculate_magnitude,
  calculate_dot_product,
  intersection_size
};

/**
 * Converts two sparse vector maps to aligned, sorted Int32Array and Float64Array.
 */
export function mapToWasmVectors(
  v1: ReadonlyMap<string, number>,
  v2: ReadonlyMap<string, number>
): [Int32Array, Float64Array, Int32Array, Float64Array] {
  const keysA = new Int32Array(v1.size);
  const valuesA = new Float64Array(v1.size);
  const keysB = new Int32Array(v2.size);
  const valuesB = new Float64Array(v2.size);

  const entriesA = Array.from(v1.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const entriesB = Array.from(v2.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let idxA = 0;
  let idxB = 0;
  let currentIdx = 0;

  while (idxA < entriesA.length && idxB < entriesB.length) {
    const entryA = entriesA[idxA]!;
    const entryB = entriesB[idxB]!;
    const keyA = entryA[0];
    const keyB = entryB[0];

    if (keyA === keyB) {
      keysA[idxA] = currentIdx;
      valuesA[idxA] = entryA[1];
      keysB[idxB] = currentIdx;
      valuesB[idxB] = entryB[1];
      idxA++;
      idxB++;
    } else if (keyA < keyB) {
      keysA[idxA] = currentIdx;
      valuesA[idxA] = entryA[1];
      idxA++;
    } else {
      keysB[idxB] = currentIdx;
      valuesB[idxB] = entryB[1];
      idxB++;
    }
    currentIdx++;
  }

  while (idxA < entriesA.length) {
    const entryA = entriesA[idxA]!;
    keysA[idxA] = currentIdx;
    valuesA[idxA] = entryA[1];
    idxA++;
    currentIdx++;
  }

  while (idxB < entriesB.length) {
    const entryB = entriesB[idxB]!;
    keysB[idxB] = currentIdx;
    valuesB[idxB] = entryB[1];
    idxB++;
    currentIdx++;
  }

  return [keysA, valuesA, keysB, valuesB];
}
