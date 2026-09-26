/**
 * Base class for errors that carry an explicit HTTP response. Thrown from services
 * and translated back into a response by `app.ts`'s error handler.
 */
export class HttpError extends Error {
  statusCode: number;
  body?: unknown;

  /**
   * @param statusCode - The HTTP status code to respond with.
   * @param message - A human-readable error message.
   * @param body - Optional response body; falls back to `{ error: message }` if omitted.
   */
  constructor(statusCode: number, message: string, body?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.body = body;
  }
}

/**
 * A referenced resource does not exist. Maps to HTTP 404.
 */
export class NotFoundError extends HttpError {
  /**
   * @param message - A human-readable error message.
   */
  constructor(message: string) {
    super(404, message);
  }
}

/**
 * The request conflicts with the current state of a resource (e.g. an invalid
 * state transition). Maps to HTTP 409.
 */
export class ConflictError extends HttpError {
  /**
   * @param message - A human-readable error message.
   * @param body - Optional response body.
   */
  constructor(message: string, body?: unknown) {
    super(409, message, body);
  }
}

/**
 * The request is well-formed but cannot be processed (e.g. insufficient balance,
 * turnover not met). Maps to HTTP 422.
 */
export class UnprocessableError extends HttpError {
  /**
   * @param message - A human-readable error message.
   * @param body - Optional response body.
   */
  constructor(message: string, body?: unknown) {
    super(422, message, body);
  }
}
