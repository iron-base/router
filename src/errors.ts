export class HttpError<
  Status extends number = number,
  Details = unknown,
> extends Error {
  readonly status: Status;
  readonly details: Details;
  override readonly cause?: unknown;

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

export function httpError<Status extends number, Details>(
  status: Status,
  details: Details,
  options?: { message?: string; cause?: unknown },
): HttpError<Status, Details> {
  return new HttpError(status, details, options);
}

export class ValidationError extends Error {
  readonly status = 400;
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

export class RouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RouterError";
  }
}
