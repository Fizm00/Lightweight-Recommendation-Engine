import { calculateMagnitude, calculateDotProduct, intersectionSize } from "./math.js";
import type { SimilarityFunction } from "./similarity.js";
import { shouldWasmAccelerate, cosine_similarity, mapToWasmVectors } from "../wasm/loader.js";

/**
 * Calculates the Cosine Similarity between two sparse vectors.
 *
 * Score ranges from -1.0 to 1.0 (or 0.0 to 1.0 if rating values are strictly positive).
 * Returns 0.0 if either vector has a magnitude of 0.0 or if the intersection size is below threshold.
 *
 * @param vectorA The first sparse vector.
 * @param vectorB The second sparse vector.
 * @param minIntersectionSize The minimum number of shared items required to compute similarity.
 * @returns The cosine similarity score.
 */
export const cosineSimilarity: SimilarityFunction = (vectorA, vectorB, minIntersectionSize) => {
  if (shouldWasmAccelerate(vectorA, vectorB)) {
    try {
      const [keysA, valuesA, keysB, valuesB] = mapToWasmVectors(vectorA, vectorB);
      return cosine_similarity(keysA, valuesA, keysB, valuesB, minIntersectionSize ?? 1);
    } catch (err) {
      // Fallback silently to JS/TS
    }
  }

  const shared = intersectionSize(vectorA, vectorB);
  if (shared < (minIntersectionSize ?? 1)) {
    return 0;
  }

  const magnitudeA = calculateMagnitude(vectorA);
  const magnitudeB = calculateMagnitude(vectorB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return calculateDotProduct(vectorA, vectorB) / (magnitudeA * magnitudeB);
};
