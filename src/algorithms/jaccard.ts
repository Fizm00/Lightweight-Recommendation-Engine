import { intersectionSize } from "./math.js";
import type { SimilarityFunction } from "./similarity.js";
import { isWasmLoaded, jaccard_similarity, mapToWasmVectors } from "../wasm/loader.js";

/**
 * Calculates the Jaccard Similarity coefficient between the key sets of two sparse vectors.
 *
 * Jaccard similarity treats elements as binary attributes (present or absent).
 * Score ranges from 0.0 to 1.0. Returns 0.0 if both vectors are empty.
 *
 * @param vectorA The first sparse vector.
 * @param vectorB The second sparse vector.
 * @returns The Jaccard similarity coefficient score.
 */
export const jaccardSimilarity: SimilarityFunction = (vectorA, vectorB, minIntersectionSize) => {
  if (isWasmLoaded()) {
    try {
      const [keysA, , keysB] = mapToWasmVectors(vectorA, vectorB);
      return jaccard_similarity(keysA, keysB, minIntersectionSize ?? 1);
    } catch (err) {
      // Fallback silently to JS/TS
    }
  }

  const sizeA = vectorA.size;
  const sizeB = vectorB.size;

  if (sizeA === 0 || sizeB === 0) {
    return 0;
  }

  const intersection = intersectionSize(vectorA, vectorB);
  if (intersection < (minIntersectionSize ?? 1)) {
    return 0;
  }

  const union = sizeA + sizeB - intersection;

  return intersection / union;
};
