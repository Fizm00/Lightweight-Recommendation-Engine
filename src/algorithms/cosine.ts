import { calculateMagnitude, calculateDotProduct } from "./math.js";
import type { SimilarityFunction } from "./similarity.js";

/**
 * Calculates the Cosine Similarity between two sparse vectors.
 *
 * Score ranges from -1.0 to 1.0 (or 0.0 to 1.0 if rating values are strictly positive).
 * Returns 0.0 if either vector has a magnitude of 0.0.
 *
 * @param vectorA The first sparse vector.
 * @param vectorB The second sparse vector.
 * @returns The cosine similarity score.
 */
export const cosineSimilarity: SimilarityFunction = (vectorA, vectorB) => {
  const magnitudeA = calculateMagnitude(vectorA);
  const magnitudeB = calculateMagnitude(vectorB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return calculateDotProduct(vectorA, vectorB) / (magnitudeA * magnitudeB);
};
