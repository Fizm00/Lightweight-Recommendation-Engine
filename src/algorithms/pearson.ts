import { intersectionSize } from "./math.js";
import type { SimilarityFunction } from "./similarity.js";
import { shouldWasmAccelerate, pearson_correlation, mapToWasmVectors } from "../wasm/loader.js";

/**
 * Calculates the Pearson Correlation Coefficient between two sparse vectors.
 *
 * It subtracts the mean rating of each vector from its components (mean-centering)
 * before calculating the cosine similarity.
 *
 * Returns 0.0 if either vector has a magnitude of 0.0 (e.g. all ratings are the same)
 * or if there are no items in common or if either vector is empty or if the intersection size is below threshold.
 *
 * @param vectorA The first sparse vector.
 * @param vectorB The second sparse vector.
 * @param minIntersectionSize The minimum number of shared items required to compute similarity.
 * @returns The Pearson Correlation coefficient.
 */
export const pearsonCorrelation: SimilarityFunction = (vectorA, vectorB, minIntersectionSize) => {
  if (shouldWasmAccelerate(vectorA, vectorB)) {
    try {
      const [keysA, valuesA, keysB, valuesB] = mapToWasmVectors(vectorA, vectorB);
      return pearson_correlation(keysA, valuesA, keysB, valuesB, minIntersectionSize ?? 1);
    } catch (err) {
      // Fallback silently to JS/TS
    }
  }

  if (vectorA.size === 0 || vectorB.size === 0) {
    return 0.0;
  }

  const shared = intersectionSize(vectorA, vectorB);
  if (shared < (minIntersectionSize ?? 1)) {
    return 0.0;
  }

  // Calculate mean of vectorA
  let sumA = 0;
  for (const rating of vectorA.values()) {
    sumA += rating;
  }
  const meanA = sumA / vectorA.size;

  // Calculate mean of vectorB
  let sumB = 0;
  for (const rating of vectorB.values()) {
    sumB += rating;
  }
  const meanB = sumB / vectorB.size;

  // Calculate magnitudes of mean-centered vectors
  let sumSqA = 0;
  for (const rating of vectorA.values()) {
    const diff = rating - meanA;
    sumSqA += diff * diff;
  }
  const magnitudeA = Math.sqrt(sumSqA);

  let sumSqB = 0;
  for (const rating of vectorB.values()) {
    const diff = rating - meanB;
    sumSqB += diff * diff;
  }
  const magnitudeB = Math.sqrt(sumSqB);

  // Avoid division by zero
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0.0;
  }

  // Calculate dot product of mean-centered vectors (only on intersection)
  // Optimize by iterating over the smaller vector
  const [smaller, larger, meanSmall, meanLarge] =
    vectorA.size < vectorB.size
      ? [vectorA, vectorB, meanA, meanB]
      : [vectorB, vectorA, meanB, meanA];

  let dotProduct = 0;
  for (const [itemId, ratingSmall] of smaller.entries()) {
    const ratingLarge = larger.get(itemId);
    if (ratingLarge !== undefined) {
      dotProduct += (ratingSmall - meanSmall) * (ratingLarge - meanLarge);
    }
  }

  return dotProduct / (magnitudeA * magnitudeB);
};
