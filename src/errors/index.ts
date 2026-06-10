/**
 * Base custom error class for the nano-recommender library.
 */
export class RecommenderError extends Error {
  /**
   * Constructs a new RecommenderError.
   *
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends RecommenderError {
  /**
   * Constructs a new ValidationError.
   *
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
  }
}

/**
 * Error thrown when an interaction contains invalid or corrupt data.
 */
export class InvalidInteractionError extends RecommenderError {
  /**
   * Constructs a new InvalidInteractionError.
   *
   * @param message The error message.
   */
  constructor(message: string) {
    super(message);
  }
}
