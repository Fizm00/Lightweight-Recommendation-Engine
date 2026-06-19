import type { NanoRecommender } from "../recommender.js";
import type { Interaction } from "../types/index.js";
import { evaluate, type EvaluationResult } from "./runner.js";

/**
 * Definition of the parameter search space for tuning.
 * Each parameter has an array of possible values to try.
 */
export interface ParameterGrid {
  readonly k?: number[];
  readonly similarityThreshold?: number[];
  readonly minIntersectionSize?: number[];
  readonly hybridAlpha?: number[];
  readonly strategy?: ("item-based" | "user-based" | "hybrid" | "content-based")[];
  readonly [key: string]: any[] | undefined;
}

/**
 * Configuration options for the tuning process.
 */
export interface TuningOptions {
  /** The target metric to optimize. Defaults to "ndcg". */
  readonly metric?:
    | "precision"
    | "recall"
    | "ndcg"
    | "map"
    | "mrr"
    | "diversity"
    | "novelty"
    | "serendipity"
    | "coverage"
    | "rmse"
    | "mae";
  /** The value of K for recommendation evaluation. Defaults to 10. */
  readonly topK?: number;
  /** Whether a higher metric value is better. Defaults to true (except for rmse and mae). */
  readonly higherIsBetter?: boolean;
}

/**
 * Represent a single trial in the tuning process.
 */
export interface TuningTrial {
  readonly parameters: Record<string, any>;
  readonly score: number | null;
  readonly result: EvaluationResult;
}

/**
 * Represents the final results of hyperparameter tuning.
 */
export interface TuningResult {
  /** The best parameter combination found. */
  readonly bestParameters: Record<string, any> | null;
  /** The best score achieved, or null if no trial returned a valid score. */
  readonly bestScore: number | null;
  /** List of all trials run during the search. */
  readonly trials: TuningTrial[];
}

/**
 * Generates Cartesian product of the parameter grid arrays.
 */
function generateCombinations(grid: ParameterGrid): Record<string, any>[] {
  const keys = Object.keys(grid).filter(k => Array.isArray(grid[k]));
  if (keys.length === 0) return [{}];

  const combinations: Record<string, any>[] = [];

  function helper(index: number, current: Record<string, any>) {
    if (index === keys.length) {
      combinations.push({ ...current });
      return;
    }

    const key = keys[index]!;
    const values = grid[key]!;
    for (const val of values) {
      current[key] = val;
      helper(index + 1, current);
    }
  }

  helper(0, {});
  return combinations;
}

/**
 * Runs hyperparameter tuning using Grid Search to find the best configuration.
 *
 * @param recommender The NanoRecommender instance to evaluate.
 * @param trainData The training interactions dataset.
 * @param testData The test interactions dataset.
 * @param parameterGrid The grid of parameters and values to explore.
 * @param options Tuning configurations including metric choice.
 * @returns The tuning results.
 */
export function tune(
  recommender: NanoRecommender,
  trainData: Interaction[],
  testData: Interaction[],
  parameterGrid: ParameterGrid,
  options: TuningOptions = {}
): TuningResult {
  const metric = options.metric ?? "ndcg";
  const topK = options.topK ?? 10;
  const higherIsBetter = options.higherIsBetter ?? (metric !== "rmse" && metric !== "mae");

  const combinations = generateCombinations(parameterGrid);
  const trials: TuningTrial[] = [];

  let bestParameters: Record<string, any> | null = null;
  let bestScore: number | null = null;

  for (const combo of combinations) {
    const result = evaluate(recommender, trainData, testData, {
      topK,
      strategyOptions: combo,
    });

    const score = result[metric];
    trials.push({
      parameters: combo,
      score,
      result,
    });

    if (score !== null) {
      if (bestScore === null) {
        bestScore = score;
        bestParameters = combo;
      } else {
        const isBetter = higherIsBetter ? score > bestScore : score < bestScore;
        if (isBetter) {
          bestScore = score;
          bestParameters = combo;
        }
      }
    }
  }

  return {
    bestParameters,
    bestScore,
    trials,
  };
}
