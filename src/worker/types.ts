/**
 * Represents a request message sent from the main thread to the Web Worker.
 */
export interface WorkerRequest {
  /** A unique identifier for this request to match its response. */
  readonly id: string;
  /** The action type to execute in the worker. */
  readonly type: "init" | "load" | "addInteraction" | "recommend" | "recommendSession" | "recommendItemBased" | "recommendUserBased" | "recommendContentBased" | "recommendHybrid" | "clear" | "stats" | "export" | "import" | "reset";
  /** Optional payload payload associated with the request. */
  readonly payload?: any;
}

/**
 * Represents a response message sent from the Web Worker back to the main thread.
 */
export interface WorkerResponse {
  /** The unique identifier matching the original request. */
  readonly id: string;
  /** The response action type (e.g. `${requestType}_success`). */
  readonly type: string;
  /** Optional response payload payload (on success). */
  readonly payload?: any;
  /** Optional error message (on failure). */
  readonly error?: string;
}
