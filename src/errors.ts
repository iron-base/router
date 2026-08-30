/** An expected HTTP failure with a status code, structured details, and an optional cause. */
export class HttpError<
  Status extends number = number,
  Details = unknown,
> extends Error {
  /** The HTTP status code returned for this failure. */
  readonly status: Status;
  /** Application-specific details associated with the failure. */
  readonly details: Details;
  /** The error that caused this failure, when supplied. */
  override readonly cause?: unknown;

  /**
   * Creates an expected HTTP failure.
   *
   * @param status - The HTTP status code to return.
   * @param details - Application-specific details for the failure.
   * @param options - An optional message and underlying cause.
   * @example
   * ```ts
   * throw new HttpError(404, { userId: "42" });
   * ```
   * @returns The new HTTP error instance.
   */
  constructor(
    status: Status,
    details: Details,
    options: { message?: string; cause?: unknown } = {},
  ) {
    super(options.message ?? `HTTP ${status}`, { cause: options.cause });
    this.name = "HttpError";
    this.status = status;
    this.details = details;
    this.cause = options.cause;
  }
}

/**
 * Creates an expected HTTP failure.
 *
 * @param status - The HTTP status code to return.
 * @param details - Application-specific details for the failure.
 * @param options - An optional message and underlying cause.
 * @example
 * ```ts
 * throw httpError(404, { userId: "42" });
 * ```
 * @returns An `HttpError` retaining the supplied status and details types.
 */
export function httpError<Status extends number, Details>(
  status: Status,
  details: Details,
  options?: { message?: string; cause?: unknown },
): HttpError<Status, Details> {
  return new HttpError(status, details, options);
}

/** A `400` error raised when a route request fails contract validation. */
export class ValidationError extends Error {
  /** The status code returned for validation failures. */
  readonly status = 400;
  /**
   * Creates a validation error from normalized schema issues.
   *
   * @param location - The request section that failed validation.
   * @param issues - The validation issues reported by the schema.
   * @example
   * ```ts
   * throw new ValidationError("query", [{ message: "Expected a number" }]);
   * ```
   * @returns The new validation error instance.
   */
  constructor(
    readonly location: "params" | "query" | "headers" | "body",
    readonly issues: readonly {
      message: string;
      path?: readonly PropertyKey[];
    }[],
  ) {
    super(`Invalid ${location}`);
    this.name = "ValidationError";
  }
}

/** An HTTP error raised by the router while dispatching a request. */
export class RouterError extends Error {
  /**
   * Creates a router error.
   *
   * @param status - The HTTP status code to return.
   * @param message - The error message.
   * @example
   * ```ts
   * throw new RouterError(404, "Not found");
   * ```
   * @returns The new router error instance.
   */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RouterError";
  }
}
