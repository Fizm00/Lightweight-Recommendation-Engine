/**
 * Contract representing a similarity computation algorithm between two sparse vectors.
 */
export interface SimilarityFunction {
  /**
   * Calculates the similarity score between two sparse vectors.
   *
   * @param vectorA The first sparse vector.
   * @param vectorB The second sparse vector.
   * @param minIntersectionSize The minimum number of shared items required to compute similarity.
   * @returns A similarity score (higher values represent higher similarity).
   */
  (
    vectorA: ReadonlyMap<string, number>,
    vectorB: ReadonlyMap<string, number>,
    minIntersectionSize?: number
  ): number;
}
