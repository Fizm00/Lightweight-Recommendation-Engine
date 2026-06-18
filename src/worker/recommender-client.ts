import type { Interaction, Recommendation, RecommenderState, SessionRecommendationOptions } from "../types/index.js";
import type { ItemBasedRecommendationOptions } from "../algorithms/item-based.js";
import type { UserBasedRecommendationOptions } from "../algorithms/user-based.js";
import type { ContentBasedRecommendationOptions } from "../algorithms/content-based.js";
import type { NanoRecommenderConfig, RecommenderStats, RecommendationOptions } from "../recommender.js";
import type { WorkerRequest, WorkerResponse } from "./types.js";

/**
 * An asynchronous client wrapper for NanoRecommender that runs all computations
 * inside a Web Worker to prevent blocking the main UI thread.
 */
export class NanoRecommenderWorker {
  private readonly worker: Worker;
  private readonly pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private nextRequestId = 0;

  /**
   * Constructs a new NanoRecommenderWorker instance.
   *
   * @param workerOrUrl Optional pre-instantiated Worker or worker script URL/path.
   * @param options Optional configuration for the new Worker (e.g. { type: 'module' }).
   */
  constructor(workerOrUrl?: any, options?: { type?: "module" | "classic" }) {
    if (workerOrUrl && typeof workerOrUrl.postMessage === "function" && typeof workerOrUrl.terminate === "function") {
      this.worker = workerOrUrl;
    } else if (typeof window !== "undefined" && typeof Worker !== "undefined") {
      const url = workerOrUrl ?? new URL("./recommender.worker.js", import.meta.url);
      this.worker = new Worker(url, { type: options?.type ?? "module" });
    } else if (typeof globalThis !== "undefined" && (globalThis as any).Worker) {
      const url = workerOrUrl ?? "./recommender.worker.js";
      this.worker = new (globalThis as any).Worker(url, { type: options?.type ?? "module" });
    } else {
      throw new Error("Web Workers are not supported in this environment, or a pre-instantiated Worker instance must be provided.");
    }

    this.worker.addEventListener("message", this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const { id, payload, error } = event.data;
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(payload);
    }
  }

  private sendRequest<T>(type: WorkerRequest["type"], payload?: any): Promise<T> {
    const id = String(this.nextRequestId++);
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  /**
   * Initializes the recommender instance inside the worker.
   */
  public init(config?: NanoRecommenderConfig): Promise<void> {
    return this.sendRequest<void>("init", { config });
  }

  /**
   * Loads a dataset of user-item interactions inside the worker.
   */
  public load(
    interactions: Interaction[],
    options?: { readonly referenceTime?: number | string | Date }
  ): Promise<void> {
    return this.sendRequest<void>("load", { interactions, options });
  }

  /**
   * Adds or updates a single user-item interaction in real-time inside the worker.
   */
  public addInteraction(interaction: Interaction): Promise<void> {
    return this.sendRequest<void>("addInteraction", { interaction });
  }

  /**
   * Generates recommendation array for a user asynchronously.
   */
  public recommend(userId: string, options?: RecommendationOptions): Promise<Recommendation[]> {
    const optionsCopy = options ? { ...options } : undefined;
    if (optionsCopy && (optionsCopy as any).filter) {
      console.warn("Custom filter functions cannot be passed to a Web Worker. Use post-filtering on the results in the main thread instead.");
      delete (optionsCopy as any).filter;
    }
    return this.sendRequest<Recommendation[]>("recommend", { userId, options: optionsCopy });
  }

  /**
   * Recommends items based on an active session of item interactions asynchronously.
   */
  public recommendSession(sessionItemIds: string[], options?: SessionRecommendationOptions): Promise<Recommendation[]> {
    return this.sendRequest<Recommendation[]>("recommendSession", { sessionItemIds, options });
  }

  /**
   * Directly triggers Item-Based Collaborative Filtering asynchronously.
   */
  public recommendItemBased(userId: string, options?: ItemBasedRecommendationOptions): Promise<Recommendation[]> {
    const optionsCopy = options ? { ...options } : undefined;
    if (optionsCopy && (optionsCopy as any).filter) {
      console.warn("Custom filter functions cannot be passed to a Web Worker. Use post-filtering on the results in the main thread instead.");
      delete (optionsCopy as any).filter;
    }
    return this.sendRequest<Recommendation[]>("recommendItemBased", { userId, options: optionsCopy });
  }

  /**
   * Directly triggers User-Based Collaborative Filtering asynchronously.
   */
  public recommendUserBased(userId: string, options?: UserBasedRecommendationOptions): Promise<Recommendation[]> {
    const optionsCopy = options ? { ...options } : undefined;
    if (optionsCopy && (optionsCopy as any).filter) {
      console.warn("Custom filter functions cannot be passed to a Web Worker. Use post-filtering on the results in the main thread instead.");
      delete (optionsCopy as any).filter;
    }
    return this.sendRequest<Recommendation[]>("recommendUserBased", { userId, options: optionsCopy });
  }

  /**
   * Directly triggers Content-Based Filtering asynchronously.
   */
  public recommendContentBased(userId: string, options?: ContentBasedRecommendationOptions): Promise<Recommendation[]> {
    const optionsCopy = options ? { ...options } : undefined;
    if (optionsCopy && (optionsCopy as any).filter) {
      console.warn("Custom filter functions cannot be passed to a Web Worker. Use post-filtering on the results in the main thread instead.");
      delete (optionsCopy as any).filter;
    }
    return this.sendRequest<Recommendation[]>("recommendContentBased", { userId, options: optionsCopy });
  }

  /**
   * Directly triggers Hybrid Recommendation Strategy asynchronously.
   */
  public recommendHybrid(userId: string, options?: RecommendationOptions): Promise<Recommendation[]> {
    const optionsCopy = options ? { ...options } : undefined;
    if (optionsCopy && (optionsCopy as any).filter) {
      console.warn("Custom filter functions cannot be passed to a Web Worker. Use post-filtering on the results in the main thread instead.");
      delete (optionsCopy as any).filter;
    }
    return this.sendRequest<Recommendation[]>("recommendHybrid", { userId, options: optionsCopy });
  }

  /**
   * Clears all interaction matrices and cache data inside the worker.
   */
  public clear(): Promise<void> {
    return this.sendRequest<void>("clear");
  }

  /**
   * Retrieves summary statistics of the loaded dataset inside the worker.
   */
  public stats(): Promise<RecommenderStats> {
    return this.sendRequest<RecommenderStats>("stats");
  }

  /**
   * Exports the internal state of the recommender engine inside the worker.
   */
  public export(): Promise<RecommenderState> {
    return this.sendRequest<RecommenderState>("export");
  }

  /**
   * Restores the recommender engine state from a serialized state object inside the worker.
   */
  public import(state: RecommenderState): Promise<void> {
    return this.sendRequest<void>("import", { state });
  }

  /**
   * Resets the recommender instance inside the worker.
   */
  public reset(): Promise<void> {
    return this.sendRequest<void>("reset");
  }

  /**
   * Terminates the underlying worker thread and rejects all pending requests.
   */
  public terminate(): void {
    this.worker.terminate();
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("Worker was terminated."));
      this.pendingRequests.delete(id);
    }
  }
}
