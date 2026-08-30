import { HttpError, RouterError, ValidationError } from "./errors.ts";
import {
  DefaultRouteMatcher,
  parsePath,
  type RouteMatcher,
  splitPath,
} from "./matchers.ts";
import type { OpenAPI30 } from "./openapi/3.0.ts";
import type { OpenAPI31 } from "./openapi/3.1.ts";
import type { StandardSchemaV1 } from "./standards/schema.ts";

/** Metadata used to describe an OpenAPI document. */
export interface OpenAPIInfo {
  /** The API title. */
  readonly title: string;
  /** The OpenAPI document version. */
  readonly version: string;
  /** A description of the API. */
  readonly description?: string;
  /** A URI for the API terms of service. */
  readonly termsOfService?: string;
  /** Contact information for the exposed API. */
  readonly contact?: {
    /** The contact person or organization name. */
    readonly name?: string;
    /** A URI for the contact information. */
    readonly url?: string;
    /** The contact email address. */
    readonly email?: string;
  };
  /** License information for the exposed API. */
  readonly license?: { readonly name: string; readonly url?: string };
}
/** An OpenAPI 3.0 or 3.1 security scheme. */
export type OpenAPISecurityScheme =
  | OpenAPI30.SecurityScheme
  | OpenAPI31.SecurityScheme;

/** An HTTP method supported by the router. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "ALL";
/** A Standard Schema used to validate a request or response. */
export type Schema = StandardSchemaV1<any, any>;
/** Extracts a schema's input type, or `undefined` when no schema is supplied. */
export type InferInput<S> = S extends Schema ? StandardSchemaV1.InferInput<S>
  : undefined;
/** Extracts a schema's output type, or `undefined` when no schema is supplied. */
export type InferOutput<S> = S extends Schema ? StandardSchemaV1.InferOutput<S>
  : undefined;

type HeaderValues = Record<string, string | readonly string[]>;
type MaybePromise<T> = T | Promise<T>;
type ExtensionMap = Record<`x-${string}`, unknown>;

/** Schemas used to validate the individual sections of an incoming request. */
export interface RequestContract<
  Params extends Schema | undefined = Schema | undefined,
  Query extends Schema | undefined = Schema | undefined,
  Headers extends Schema | undefined = Schema | undefined,
  Body extends Schema | undefined = Schema | undefined,
> {
  /** The path parameter schema. */
  readonly params?: Params;
  /** The query parameter schema. */
  readonly query?: Query;
  /** The request header schema. */
  readonly headers?: Headers;
  /** The JSON request body schema. */
  readonly body?: Body;
}

/** A request whose sections have been validated against a route contract. */
export interface RouteRequest<Params, Query, Headers, Body> {
  /** The unmodified native Fetch request. */
  readonly raw: Request;
  /** The validated path parameters. */
  readonly params: Params;
  /** The validated query parameters. */
  readonly query: Query;
  /** The validated request headers. */
  readonly headers: Headers;
  /** The validated JSON request body. */
  readonly body: Body;
}

type RequestFor<C extends RequestContract | undefined> = RouteRequest<
  C extends RequestContract ? InferOutput<C["params"]> : undefined,
  C extends RequestContract ? InferOutput<C["query"]> : undefined,
  C extends RequestContract ? InferOutput<C["headers"]> : undefined,
  C extends RequestContract ? InferOutput<C["body"]> : undefined
>;

/** Describes a route response body, headers, and content type. */
export interface ResponseDefinition<
  Body extends Schema | undefined = Schema | undefined,
  Headers extends Schema | undefined = Schema | undefined,
> {
  /** The response body schema. */
  readonly body?: Body;
  /** The response header schema. */
  readonly headers?: Headers;
  /** The response description used in generated OpenAPI documents. */
  readonly description?: string;
  /** The response media type. Defaults to `application/json` when a body exists. */
  readonly contentType?: string;
}

/** Maps HTTP status codes to response schemas or definitions. */
export type ResponseDefinitions = Record<
  number,
  Schema | ResponseDefinition<Schema | undefined, Schema | undefined>
>;

type ResultHeaders<Definition> = Definition extends {
  readonly headers: infer Headers extends Schema;
} ? { readonly headers: InferOutput<Headers> }
  : { readonly headers?: HeaderValues };
type ResultForDefinition<
  Status extends number,
  Definition,
> = Definition extends Schema
  ? { readonly status: Status; readonly data: InferOutput<Definition> } & {
    readonly headers?: HeaderValues;
  }
  : Definition extends ResponseDefinition
    ? Definition extends { readonly body: infer Body extends Schema } ? {
        readonly status: Status;
        readonly data: InferOutput<Body>;
      } & ResultHeaders<Definition>
    : { readonly status: Status } & ResultHeaders<Definition>
  : never;
/** The union of declared response values that a route handler may return. */
export type HandlerResult<Responses extends ResponseDefinitions> = {
  [Status in keyof Responses & number]: ResultForDefinition<
    Status,
    Responses[Status]
  >;
}[keyof Responses & number];

/** A native Fetch response explicitly exempt from contract serialization. */
export interface RawResponse {
  /** The native response returned to the client. */
  readonly response: Response;
  readonly [rawResponse]: true;
}
const rawResponse = Symbol("ironbase.raw-response");

/**
 * Marks a native response to bypass route contract serialization.
 *
 * @param response - The native response to return unchanged.
 * @example
 * ```ts
 * return raw(new Response("stream", { headers: { "content-type": "text/plain" } }));
 * ```
 * @returns A response marker accepted by route handlers.
 */
export function raw(response: Response): RawResponse {
  return { response, [rawResponse]: true };
}

/** A function that wraps downstream routing and may extend the request context. */
export interface Middleware<ParentContext = object, AddedContext = object> {
  /**
   * Handles a request before the next middleware or route handler.
   *
   * @param request - The incoming native Fetch request.
   * @param context - Context accumulated by earlier middleware.
   * @param next - Continues dispatch with the extended context.
   * @example
   * ```ts
   * const addRequestId: Middleware = (request, context, next) => next(context);
   * ```
   * @returns A response, either from this middleware or downstream dispatch.
   * @throws {Error} If the middleware cannot continue processing the request.
   */
  (
    request: Request,
    context: ParentContext,
    next: (context: ParentContext & AddedContext) => Promise<Response>,
  ): MaybePromise<Response>;
}

/** An RFC 9457-style problem details response body. */
export interface ProblemDetails {
  /** A URI identifying the problem type. */
  readonly type?: string;
  /** A short, human-readable problem summary. */
  readonly title?: string;
  /** The HTTP status code for this problem. */
  readonly status?: number;
  /** A human-readable explanation specific to this occurrence. */
  readonly detail?: string;
  /** A URI identifying this problem occurrence. */
  readonly instance?: string;
  /** Additional problem-specific extension members. */
  readonly [extension: string]: unknown;
}

/** Configures default RFC 9457 problem details responses. */
export interface ProblemDetailsOptions<Context> {
  /** A base URI used to derive a problem type from its status. */
  readonly typeBaseUrl?: string;
  /** Derives a problem type URI for an error. */
  readonly type?: (error: unknown, status: number, context: Context) => string;
  /** Derives a problem occurrence URI for an error. */
  readonly instance?: (
    error: unknown,
    status: number,
    context: Context,
  ) => string;
  readonly defaults?: (
    error: unknown,
    status: number,
    context: Context,
  ) => Partial<ProblemDetails>;
}

type ErrorResult<
  Body extends Schema | undefined,
  Headers extends Schema | undefined,
> = Body extends Schema
  ? {
    readonly data: InferOutput<Body>;
    readonly headers?: Headers extends Schema ? InferOutput<Headers>
      : HeaderValues;
  }
  : ProblemDetails | {
    readonly data: unknown;
    readonly headers?: Headers extends Schema ? InferOutput<Headers>
      : HeaderValues;
  };

/** A structured error formatter with optional matching and response contracts. */
export interface ErrorDefinition<
  Context = object,
  Body extends Schema | undefined = Schema | undefined,
  Headers extends Schema | undefined = Schema | undefined,
  ErrorType = unknown,
> {
  /** Selects this definition for a matching thrown error and narrows it for the handler. */
  readonly match?: (error: unknown) => error is ErrorType;
  /** The schema for a custom JSON error response body. */
  readonly schema?: Body;
  /** The schema for custom error response headers. */
  readonly headers?: Headers;
  /** Formats the thrown error as problem details or custom response data. */
  readonly handler: (
    error: ErrorType,
    context: Context,
  ) => MaybePromise<ErrorResult<Body, Headers>>;
}
/** Maps HTTP error status codes to response formatters. */
type ProblemFormatter<Context> = (
  error: unknown,
  context: Context,
) => MaybePromise<ProblemDetails>;
export type ErrorDefinitions<Context> = Record<
  number,
  | ProblemFormatter<Context>
  | ErrorDefinition<Context, Schema | undefined, Schema | undefined, any>
>;

/** Configures a route's contract, metadata, middleware, and responses. */
export interface RouteOptions<
  RequestContractType extends RequestContract | undefined =
    | RequestContract
    | undefined,
  Responses extends ResponseDefinitions = ResponseDefinitions,
  Context = object,
> {
  /** A unique OpenAPI operation identifier. */
  readonly operationId?: string;
  /** A short OpenAPI operation summary. */
  readonly summary?: string;
  /** A detailed OpenAPI operation description. */
  readonly description?: string;
  /** OpenAPI tags for the operation. */
  readonly tags?: readonly string[];
  /** Whether the operation is deprecated. */
  readonly deprecated?: boolean;
  /** Explicit OpenAPI security requirements; an empty array disables inherited policies. */
  readonly security?: readonly SecurityRequirement[];
  /** Request validation schemas. */
  readonly request?: RequestContractType;
  /** The response statuses and contracts that the handler may return. */
  readonly responses: Responses;
  /** Endpoint-specific error formatters. Array status filters remain supported for OpenAPI compatibility. */
  readonly errors?: ErrorDefinitions<Context> | readonly number[];
  /** Middleware that runs after scoped middleware and before the route handler. */
  readonly middleware?: readonly Middleware<Context, any>[];
  /** OpenAPI specification extensions for the operation. */
  readonly extensions?: ExtensionMap;
}

/** An OpenAPI security requirement keyed by security-scheme name. */
export interface SecurityRequirement {
  /** The scopes required for a named security scheme. */
  readonly [scheme: string]: readonly string[];
}

/** A named security scheme and middleware in its available enforcement modes. */
export interface SecurityPolicy<Context = object, AddedContext = object> {
  /** Returns middleware that enforces the security scheme and emits required metadata. */
  required(): Middleware<Context, AddedContext>;
  /** Returns middleware that enforces the scheme without adding OpenAPI requirements. */
  optional(): Middleware<Context, AddedContext>;
  /** Returns middleware that emits OpenAPI metadata without running the scheme. */
  metadataOnly(): Middleware<Context, AddedContext>;
  /** The unique name of the OpenAPI security scheme. */
  readonly name: string;
  /** The OpenAPI security scheme definition. */
  readonly scheme: OpenAPISecurityScheme;
}

/**
 * Defines an OpenAPI security scheme coupled to context-refining middleware.
 *
 * @param definition - The scheme name, OpenAPI definition, and enforcement middleware.
 * @example
 * ```ts
 * const bearer = defineSecurity({
 *   name: "bearerAuth",
 *   scheme: { type: "http", scheme: "bearer" },
 *   middleware: (_request, context, next) => next(context),
 * });
 * ```
 * @returns A policy that exposes required, optional, and metadata-only middleware.
 */
export function defineSecurity<
  Context = object,
  AddedContext = object,
>(definition: {
  readonly name: string;
  readonly scheme: OpenAPISecurityScheme;
  readonly middleware: Middleware<Context, AddedContext>;
}): SecurityPolicy<Context, AddedContext> {
  // Metadata is attached to the middleware so Router.use can collect it.
  const policy = (mode: "required" | "optional" | "metadataOnly") => {
    const middleware = mode === "metadataOnly"
      ? (
        _: Request,
        context: Context,
        next: (value: Context & AddedContext) => Promise<Response>,
      ) => next(context as Context & AddedContext)
      : definition.middleware;
    Object.assign(middleware, {
      __ironbaseSecurity: {
        name: definition.name,
        scheme: definition.scheme,
        mode,
      },
    });
    return middleware;
  };
  return {
    name: definition.name,
    scheme: definition.scheme,
    required: () => policy("required"),
    optional: () => policy("optional"),
    metadataOnly: () => policy("metadataOnly"),
  };
}

/** Builds and optionally validates an OpenAPI document from compiled routes. */
export interface OpenAPIAdapter<Document = unknown> {
  /** The generated OpenAPI version. */
  readonly version: string;
  /** The JSON Schema target requested from route schemas. */
  readonly schemaTarget: string;
  /**
   * Builds an OpenAPI document from compiled routes.
   *
   * @param registry - The compiled route registry.
   * @example
   * ```ts
   * const document = await adapter.build(router.compile().registry);
   * ```
   * @returns The generated OpenAPI document.
   * @throws {Error} If a route cannot be represented by the adapter.
   */
  build(registry: CompiledRouteRegistry): MaybePromise<Document>;
  /**
   * Validates a document generated by this adapter.
   *
   * @param document - The generated document to validate.
   * @example
   * ```ts
   * await adapter.validate?.(document);
   * ```
   * @returns Nothing when the document is valid.
   * @throws {Error} If the document is invalid.
   */
  validate?(document: Document): MaybePromise<void>;
}

/** Configures router dispatch, validation, and OpenAPI generation. */
export interface RouterOptions<Context extends object = object> {
  /** Creates the initial context for each request. */
  readonly context?: (
    request: Request,
    runtime: unknown,
  ) => MaybePromise<Context>;
  /** Creates the route matcher used during compilation. */
  readonly matcher?: () => RouteMatcher<CompiledRoute>;
  /** Controls whether trailing slashes participate in route matching. */
  readonly trailingSlash?: "strict" | "ignore";
  /** Controls whether route path matching is case-sensitive. */
  readonly caseSensitive?: boolean;
  /** Enables automatic `OPTIONS` responses for matched paths. */
  readonly autoOptions?: boolean;
  /** The maximum JSON request body size in bytes. */
  readonly bodyLimit?: number;
  /** Controls validation of successful response bodies and headers. */
  readonly responseValidation?: "off" | "development" | "always";
  /** Configures default problem details responses. */
  readonly problemDetails?: ProblemDetailsOptions<Context>;
  /** The path where the generated OpenAPI document is served. Defaults to `/openapi.json`. */
  readonly openApiUrl?: string;
  /** Configures OpenAPI document generation. */
  readonly openapi?: {
    /** The default OpenAPI adapter. */
    readonly adapter?: OpenAPIAdapter;
    /** Default OpenAPI document metadata. */
    readonly info?: OpenAPIInfo;
  };
}

interface SecurityMetadata {
  readonly name: string;
  readonly scheme: OpenAPISecurityScheme;
  readonly mode: "required" | "optional" | "metadataOnly";
}
interface Scope {
  readonly context?: (
    request: Request,
    runtime: unknown,
  ) => MaybePromise<object>;
  readonly middleware: readonly Middleware<any, any>[];
}
interface InternalRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly options: RouteOptions<any, any, any>;
  readonly handler: (
    request: RouteRequest<any, any, any, any>,
    context: any,
  ) => MaybePromise<HandlerResult<any> | RawResponse>;
  readonly scopes: readonly Scope[];
  readonly errors: ReadonlyMap<number, InternalErrorDefinition>;
  readonly errorScopes: readonly ReadonlyMap<number, InternalErrorDefinition>[];
  readonly security: ReadonlyMap<string, SecurityMetadata>;
}
interface InternalErrorDefinition {
  readonly status: number;
  readonly definition:
    | ((error: unknown, context: any) => MaybePromise<ProblemDetails>)
    | ErrorDefinition<any, any, any, any>;
}
interface State {
  readonly options: RouterOptions<any>;
  readonly scopes: readonly Scope[];
  readonly routes: readonly InternalRoute[];
  readonly errors: ReadonlyMap<number, InternalErrorDefinition>;
  readonly security: ReadonlyMap<string, SecurityMetadata>;
}

/** An immutable, normalized route prepared for dispatch and document generation. */
export interface CompiledRoute {
  /** The route HTTP method. */
  readonly method: HttpMethod;
  /** The normalized route path. */
  readonly path: string;
  /** The route metadata and contracts. */
  readonly options: RouteOptions<any, any, any>;
  /** The internal route definition used during dispatch. */
  readonly route: InternalRoute;
}
/** The immutable collection of compiled routes and discovered security schemes. */
export interface CompiledRouteRegistry {
  /** The normalized routes in registration order. */
  readonly routes: readonly CompiledRoute[];
  /** Security schemes discovered from route middleware. */
  readonly securitySchemes: Readonly<Record<string, OpenAPISecurityScheme>>;
  /** OpenAPI metadata configured for the router. */
  readonly info?: OpenAPIInfo;
}

/** A router prepared to dispatch requests without further route compilation. */
export interface CompiledRouter<Runtime = unknown> {
  /**
   * Dispatches a native Fetch request.
   *
   * @param request - The incoming request.
   * @param runtime - An optional runtime value for context creation.
   * @example
   * ```ts
   * const response = await compiled.fetch(new Request("https://api.example.test/health"));
   * ```
   * @returns The route response.
   */
  fetch(request: Request, runtime?: Runtime): Promise<Response>;
  /**
   * Creates, when needed, and dispatches a Fetch request.
   *
   * @param input - An absolute URL or native request.
   * @param init - Request options when `input` is a URL.
   * @param runtime - An optional runtime value for context creation.
   * @example
   * ```ts
   * const response = await compiled.request("https://api.example.test/health");
   * ```
   * @returns The route response.
   */
  request(
    input: string | Request,
    init?: RequestInit,
    runtime?: Runtime,
  ): Promise<Response>;
  /** The immutable route registry used by this router. */
  readonly registry: CompiledRouteRegistry;
}

/** An immutable route builder and Fetch request dispatcher. */
export class Router<
  Context extends object = object,
  Requirements extends object = object,
> {
  #state: State;
  #compiled?: CompiledRouter;

  /** @internal Creates a router from immutable builder state. */
  constructor(state: State) {
    this.#state = state;
  }

  /**
   * Adds scoped middleware or mounts another router at `/`.
   *
   * @param value - Middleware to add, or a child router to mount.
   * @example
   * ```ts
   * const authenticated = app.use((request, context, next) => next(context));
   * ```
   * @returns A new router with the additional scope.
   * @throws {Error} If the router has no active scope.
   */
  use<AddedContext extends object>(
    middleware: Middleware<Context, AddedContext>,
  ): Router<Context & AddedContext, Requirements>;
  use<ChildContext extends object, ChildRequirements extends object>(
    child:
      & Router<ChildContext, ChildRequirements>
      & (Context extends ChildRequirements ? unknown : never),
  ): Router<Context, Requirements>;
  use(value: Middleware<any, any> | Router<any>): Router<any> {
    if (value instanceof Router) {
      return this.mount(
        "/",
        value as Router<any, any> & (Context extends any ? unknown : never),
      );
    }
    const scopes = [...this.#state.scopes];
    const current = scopes[scopes.length - 1];
    if (!current) throw new Error("Router has no scope");
    scopes[scopes.length - 1] = {
      ...current,
      middleware: [...current.middleware, value],
    };
    const security = new Map(this.#state.security);
    const metadata = (value as any).__ironbaseSecurity as
      | SecurityMetadata
      | undefined;
    if (metadata) security.set(metadata.name, metadata);
    return new Router({ ...this.#state, scopes, security });
  }

  /**
   * Registers error response formatters for this router scope.
   *
   * @param definitions - Error formatters keyed by HTTP status code.
   * @example
   * ```ts
   * const appWithErrors = app.errors({ 404: () => ({ title: "Not found" }) });
   * ```
   * @returns A new router with the error definitions.
   * @throws {TypeError} If a key is not an HTTP error status from 400 through 599.
   */
  errors<
    Body extends Schema | undefined = undefined,
    Headers extends Schema | undefined = undefined,
    ErrorType = unknown,
  >(
    definitions: Record<
      number,
      ErrorDefinition<Context, Body, Headers, ErrorType>
    >,
  ): Router<Context, Requirements>;
  errors<const Definitions extends ErrorDefinitions<Context>>(
    definitions: Definitions & (
      Extract<Definitions[keyof Definitions], Function> extends never
        ? never
        : unknown
    ),
  ): Router<Context, Requirements>;
  errors(
    definitions: ErrorDefinitions<Context>,
  ): Router<Context, Requirements> {
    const errors = new Map(this.#state.errors);
    for (const [status, definition] of errorDefinitions(definitions)) {
      errors.set(status, definition);
    }
    return new Router({ ...this.#state, errors });
  }

  /**
   * Mounts a child router under a path prefix.
   *
   * @param prefix - The absolute path prefix for the child routes.
   * @param child - The router to mount.
   * @example
   * ```ts
   * const appWithUsers = app.mount("/users", usersRouter);
   * ```
   * @returns A new router containing the mounted child routes.
   * @throws {TypeError} If `prefix` does not start with `/`.
   */
  mount<ChildContext extends object, ChildRequirements extends object>(
    prefix: string,
    child:
      & Router<ChildContext, ChildRequirements>
      & (Context extends ChildRequirements ? unknown : never),
  ): Router<Context, Requirements> {
    const normalizedPrefix = normalizeRoutePath(prefix, this.#state.options);
    const childState = child.#state;
    const routes = childState.routes.map((route) => ({
      ...route,
      path: joinPaths(normalizedPrefix, route.path),
      scopes: [...this.#state.scopes, ...route.scopes],
      errors: mergeErrorScopes([...route.errorScopes, this.#state.errors]),
      errorScopes: [...route.errorScopes, this.#state.errors],
      security: new Map([...this.#state.security, ...route.security]),
    }));
    return new Router({
      ...this.#state,
      routes: [...this.#state.routes, ...routes],
    });
  }

  /**
   * Registers a `GET` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const withHealth = app.get("/health", { responses: { 200: schema } }, () => ({ status: 200, data: {} }));
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  get<
    RequestType extends RequestContract | undefined,
    Responses extends ResponseDefinitions,
    Body extends Schema | undefined = undefined,
    Headers extends Schema | undefined = undefined,
    ErrorType = unknown,
  >(
    path: string,
    options: Omit<RouteOptions<RequestType, Responses, Context>, "errors"> & {
      readonly errors: Record<
        number,
        ErrorDefinition<Context, Body, Headers, ErrorType>
      >;
    },
    handler: (
      request: RequestFor<RequestType>,
      context: Context,
    ) => MaybePromise<HandlerResult<Responses>> | RawResponse,
  ): Router<Context, Requirements>;
  get<
    RequestType extends RequestContract | undefined,
    Responses extends ResponseDefinitions,
  >(
    path: string,
    options: RouteOptions<RequestType, Responses, Context>,
    handler: (
      request: RequestFor<RequestType>,
      context: Context,
    ) => MaybePromise<HandlerResult<Responses>> | RawResponse,
  ): Router<Context, Requirements>;
  get(
    path: string,
    options: RouteOptions<any, any, Context>,
    handler: RouteHandler<any, Context>,
  ): Router<Context, Requirements> {
    return this.#route("GET", path, options, handler);
  }
  /**
   * Registers a `POST` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const withUsers = app.post("/users", { responses: { 201: schema } }, createUser);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  post<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("POST", path, options, handler);
  }
  /**
   * Registers a `PUT` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const updated = app.put("/users/{id}", { responses: { 200: schema } }, updateUser);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  put<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("PUT", path, options, handler);
  }
  /**
   * Registers a `PATCH` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const patched = app.patch("/users/{id}", { responses: { 200: schema } }, patchUser);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  patch<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("PATCH", path, options, handler);
  }
  /**
   * Registers a `DELETE` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const removed = app.delete("/users/{id}", { responses: { 204: {} } }, deleteUser);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  delete<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("DELETE", path, options, handler);
  }
  /**
   * Registers a `HEAD` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const withHead = app.head("/health", { responses: { 204: {} } }, healthHead);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  head<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("HEAD", path, options, handler);
  }
  /**
   * Registers an `OPTIONS` route.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const withOptions = app.options("/users", { responses: { 204: {} } }, optionsHandler);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  options<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("OPTIONS", path, options, handler);
  }
  /**
   * Registers a route that matches every HTTP method.
   *
   * @param path - The absolute route path.
   * @param options - The route contract and metadata.
   * @param handler - The validated request handler.
   * @example
   * ```ts
   * const fallback = app.all("/proxy/*path", { responses: { 200: schema } }, proxy);
   * ```
   * @returns A new router containing the route.
   * @throws {TypeError} If `path` does not start with `/`.
   */
  all<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("ALL", path, options, handler);
  }

  /**
   * Compiles route definitions into an immutable dispatcher and registry.
   *
   * @example
   * ```ts
   * const compiled = app.compile();
   * ```
   * @returns The cached compiled router.
   * @throws {Error} If routes, operation IDs, security schemes, or extensions conflict.
   */
  compile(): CompiledRouter {
    if (this.#compiled) return this.#compiled;
    const options = this.#state.options;
    const matcher = options.matcher?.() ??
      new DefaultRouteMatcher<CompiledRoute>();
    const routes = this.#state.routes.map((route) => ({
      method: route.method,
      path: normalizeRoutePath(route.path, options),
      options: route.options,
      route,
    }));
    const seen = new Map<string, CompiledRoute>();
    const operationIds = new Map<string, CompiledRoute>();
    const schemes = new Map<string, OpenAPISecurityScheme>();
    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      const previous = seen.get(key);
      if (previous) {
        throw new Error(
          `Duplicate route ${key}; already registered at ${previous.path}`,
        );
      }
      seen.set(key, route);
      validateRoute(route);
      if (route.options.operationId) {
        const previousOperation = operationIds.get(route.options.operationId);
        if (previousOperation) {
          throw new Error(
            `Duplicate operationId '${route.options.operationId}' for ${route.method} ${route.path} and ${previousOperation.method} ${previousOperation.path}`,
          );
        }
        operationIds.set(route.options.operationId, route);
      }
      for (const metadata of route.route.security.values()) {
        const previousScheme = schemes.get(metadata.name);
        if (
          previousScheme &&
          stableJson(previousScheme) !== stableJson(metadata.scheme)
        ) {
          throw new Error(`Conflicting security scheme '${metadata.name}'`);
        }
        schemes.set(metadata.name, metadata.scheme);
      }
      matcher.add(route.method, route.path, route);
    }
    const registry = Object.freeze({
      routes: Object.freeze(routes.map((route) => Object.freeze(route))),
      securitySchemes: Object.freeze(Object.fromEntries(schemes)),
      info: options.openapi?.info,
    });
    const compiled: CompiledRouter = {
      registry,
      fetch: (request, runtime) =>
        dispatch(
          request,
          runtime,
          matcher,
          registry,
          options,
          this.#state.errors,
        ),
      request: (input, init, runtime) => {
        const request = input instanceof Request
          ? input
          : new Request(input, init);
        return dispatch(
          request,
          runtime,
          matcher,
          registry,
          options,
          this.#state.errors,
        );
      },
    };
    this.#compiled = compiled;
    return compiled;
  }

  /**
   * Dispatches a native Fetch request through the compiled router.
   *
   * @param request - The incoming request.
   * @param runtime - An optional runtime value for context creation.
   * @example
   * ```ts
   * const response = await app.fetch(new Request("https://api.example.test/health"));
   * ```
   * @returns The route response.
   */
  fetch(request: Request, runtime?: unknown): Promise<Response> {
    return this.compile().fetch(request, runtime);
  }

  /**
   * Creates, when needed, and dispatches a Fetch request through the router.
   *
   * @param input - An absolute URL or native request.
   * @param init - Request options when `input` is a URL.
   * @param runtime - An optional runtime value for context creation.
   * @example
   * ```ts
   * const response = await app.request("https://api.example.test/health");
   * ```
   * @returns The route response.
   */
  request(
    input: string | Request,
    init?: RequestInit,
    runtime?: unknown,
  ): Promise<Response> {
    return this.compile().request(input, init, runtime);
  }

  /**
   * Builds an OpenAPI document from the compiled route registry.
   *
   * @param options - An optional adapter and validation setting.
   * @example
   * ```ts
   * const document = await app.openapi({ validate: true });
   * ```
   * @returns An OpenAPI 3.1 document by default, or the supplied adapter's document type.
   * @throws {Error} If route schemas cannot be converted or validation fails.
   */
  openapi(options?: {
    readonly validate?: boolean;
  }): Promise<OpenAPI31.Document>;
  openapi<Document>(options: {
    readonly adapter: OpenAPIAdapter<Document>;
    readonly validate?: boolean;
  }): Promise<Document>;
  async openapi<Document = OpenAPI31.Document>(
    options: {
      readonly adapter?: OpenAPIAdapter<Document>;
      readonly validate?: boolean;
    } = {},
  ): Promise<Document> {
    if (!options.adapter && !this.#state.options.openapi?.adapter) {
      const { openapi31 } = await import("./openapi.ts");
      const adapter = openapi31();
      const document = await adapter.build(this.compile().registry);
      if (options.validate && adapter.validate) {
        await adapter.validate(document);
      }
      return document as Document;
    }
    const adapter = (options.adapter ??
      this.#state.options.openapi?.adapter) as OpenAPIAdapter<Document>;
    const document = await adapter.build(this.compile().registry);
    if (options.validate && adapter.validate) await adapter.validate(document);
    return document;
  }

  #route(
    method: HttpMethod,
    path: string,
    options: RouteOptions<any, any, Context>,
    handler: RouteHandler<any, Context>,
  ): Router<Context, Requirements> {
    const routeErrors = errorDefinitions(options.errors);
    const errorScopes = [routeErrors, this.#state.errors];
    const route: InternalRoute = {
      method,
      path: normalizeRoutePath(path, this.#state.options),
      options: snapshotRouteOptions(options),
      handler: handler as InternalRoute["handler"],
      scopes: this.#state.scopes,
      errors: mergeErrorScopes(errorScopes),
      errorScopes,
      security: this.#state.security,
    };
    return new Router({
      ...this.#state,
      routes: [...this.#state.routes, route],
    });
  }
}

type RouteHandler<Options extends RouteOptions<any, any, any>, Context> = (
  request: RequestFor<Options["request"]>,
  context: Context,
) => MaybePromise<HandlerResult<Options["responses"]>> | RawResponse;

/**
 * Creates an immutable Fetch-native router.
 *
 * @param options - Router dispatch, validation, and OpenAPI options.
 * @example
 * ```ts
 * const app = createRouter().get("/health", { responses: { 200: schema } }, () => ({ status: 200, data: {} }));
 * ```
 * @returns A router builder with the configured context type.
 */
export function createRouter(): Router<{}, {}>;
export function createRouter<Requirements extends object>(): Router<
  Requirements,
  Requirements
>;
export function createRouter<Context extends object>(
  options: RouterOptions<Context>,
): Router<Context, {}>;
export function createRouter<Context extends object = object>(
  options: RouterOptions<Context> = {},
): Router<Context, object> {
  normalizeRoutePath(options.openApiUrl ?? "/openapi.json", options);
  const state: State = {
    options,
    scopes: [{ context: options.context, middleware: [] }],
    routes: [],
    errors: new Map(),
    security: new Map(),
  };
  return new Router<Context, object>(state);
}

async function dispatch(
  request: Request,
  runtime: unknown,
  matcher: RouteMatcher<CompiledRoute>,
  registry: CompiledRouteRegistry,
  options: RouterOptions,
  rootErrors: ReadonlyMap<number, InternalErrorDefinition>,
): Promise<Response> {
  let context: object = {};
  let route: CompiledRoute | undefined;
  try {
    const url = new URL(request.url);
    const pathname = normalizeIncomingPath(url.pathname, options);
    const method = request.method.toUpperCase();
    if (pathname === normalizeRoutePath(options.openApiUrl ?? "/openapi.json", options)) {
      if (method !== "GET" && method !== "HEAD") {
        return new Response(null, {
          status: 405,
          headers: { allow: "GET, HEAD" },
        });
      }
      const response = await openApiResponse(registry, options);
      if (method === "GET") return response;
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    let match = matcher.match(method, pathname);
    route = match?.route;
    let headFromGet = false;
    if (!route && method === "HEAD") {
      match = matcher.match("GET", pathname);
      route = match?.route;
      headFromGet = Boolean(route);
    }
    if (!route || !match) {
      const allowed = allowedMethods(registry.routes, pathname);
      if (allowed.length) {
        if (method === "OPTIONS" && options.autoOptions !== false) {
          return new Response(null, {
            status: 204,
            headers: { allow: allowed.join(", ") },
          });
        }
        throw new RouterError(405, "Method not allowed");
      }
      throw new RouterError(404, "Not found");
    }
    const scopes = route.route.options.security?.length === 0
      ? route.route.scopes.map((scope) => ({
        ...scope,
        middleware: scope.middleware.filter(
          (middleware) => !isSecurityMiddleware(middleware),
        ),
      }))
      : route.route.scopes;
    const response = await runScopes(
      scopes,
      request,
      runtime,
      (value) => {
        context = value;
      },
      async (effectiveContext) => {
        context = effectiveContext;
        return runMiddleware(
          route!.route.options.middleware ?? [],
          request,
          effectiveContext,
          (localContext) =>
            executeRoute(
              route!.route,
              request,
              match.params,
              localContext,
              options,
            ),
        );
      },
    );
    if (!headFromGet) return response;
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    const response = await formatError(
      error,
      route?.route,
      context,
      options,
      rootErrors,
    );
    if (error instanceof RouterError && error.status === 405) {
      const allowed = allowedMethods(
        registry.routes,
        normalizeIncomingPath(new URL(request.url).pathname, options),
      );
      response.headers.set("allow", allowed.join(", "));
    }
    return response;
  }
}

async function openApiResponse(
  registry: CompiledRouteRegistry,
  options: RouterOptions,
): Promise<Response> {
  if (options.openapi?.adapter) {
    const document = await options.openapi.adapter.build(registry);
    return new Response(JSON.stringify(document), {
      headers: { "content-type": "application/json" },
    });
  }
  const { openapi31 } = await import("./openapi.ts");
  const document = await openapi31().build(registry);
  return new Response(JSON.stringify(document), {
    headers: { "content-type": "application/json" },
  });
}

async function runScopes(
  scopes: readonly Scope[],
  request: Request,
  runtime: unknown,
  onContext: (context: object) => void,
  terminal: (context: object) => Promise<Response>,
  index = 0,
  context: object = {},
): Promise<Response> {
  const scope = scopes[index];
  if (!scope) return terminal(context);
  const added = scope.context ? await scope.context(request, runtime) : {};
  const current = Object.assign(context, added);
  onContext(current);
  return runMiddleware(scope.middleware, request, current, (nextContext) => {
    onContext(nextContext);
    return runScopes(
      scopes,
      request,
      runtime,
      onContext,
      terminal,
      index + 1,
      nextContext,
    );
  });
}

async function runMiddleware(
  middleware: readonly Middleware<any, any>[],
  request: Request,
  context: any,
  terminal: (context: any) => Promise<Response>,
  index = 0,
): Promise<Response> {
  const current = middleware[index];
  if (!current) return terminal(context);
  let called = false;
  const next = async (nextContext: any): Promise<Response> => {
    if (called) {
      throw new RouterError(500, "Middleware called next() more than once");
    }
    called = true;
    return runMiddleware(middleware, request, nextContext, terminal, index + 1);
  };
  return current(request, context, next);
}

async function executeRoute(
  route: InternalRoute,
  request: Request,
  rawParams: Record<string, string>,
  context: any,
  options: RouterOptions,
): Promise<Response> {
  const contract = route.options.request;
  const validatedParams = contract?.params
    ? await validate(contract.params, decodeParams(rawParams), "params")
    : undefined;
  const validatedQuery = contract?.query
    ? await validate(contract.query, queryValues(new URL(request.url)), "query")
    : undefined;
  const validatedHeaders = contract?.headers
    ? await validate(contract.headers, headerValues(request.headers), "headers")
    : undefined;
  let validatedBody: unknown;
  if (contract?.body) {
    const body = await readJsonBody(request, options.bodyLimit ?? 1_048_576);
    validatedBody = await validate(contract.body, body, "body");
  }
  const result = await route.handler(
    {
      raw: request,
      params: validatedParams,
      query: validatedQuery,
      headers: validatedHeaders,
      body: validatedBody,
    },
    context,
  );
  if (isRawResponse(result)) return result.response;
  return serializeSuccess(result, route.options.responses, options);
}

async function validate(
  schema: Schema,
  value: unknown,
  location: ValidationError["location"],
): Promise<unknown> {
  const result = await schema["~standard"].validate(value);
  if (result.issues) {
    throw new ValidationError(
      location,
      result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path?.map((segment) =>
          typeof segment === "object" ? segment.key : segment
        ),
      })),
    );
  }
  return result.value;
}

async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const type = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.toLowerCase();
  if (type !== "application/json" && !type?.endsWith("+json")) {
    throw new RouterError(415, "Unsupported media type");
  }
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) {
    throw new RouterError(413, "Request body too large");
  }
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RouterError(413, "Request body too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ValidationError("body", [{ message: "Invalid JSON" }]);
  }
}

async function serializeSuccess(
  result: any,
  definitions: ResponseDefinitions,
  options: RouterOptions,
): Promise<Response> {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.status !== "number"
  ) {
    throw new RouterError(500, "Route handler must return a declared response");
  }
  const definition = definitions[result.status];
  if (!definition) {
    throw new RouterError(500, `Undeclared response status ${result.status}`);
  }
  const normalized = isSchema(definition)
    ? { body: definition, contentType: "application/json" }
    : definition;
  if (!normalized.body && "data" in result) {
    throw new RouterError(
      500,
      `Status ${result.status} does not declare a response body`,
    );
  }
  if (normalized.body && shouldValidateResponse(options)) {
    await validateResponse(normalized.body, result.data, "body");
  }
  const responseHeaders = new Headers();
  appendHeaders(responseHeaders, result.headers);
  if (normalized.headers && shouldValidateResponse(options)) {
    await validateResponse(
      normalized.headers,
      headerValues(responseHeaders),
      "headers",
    );
  }
  const contentType = normalized.contentType ?? "application/json";
  let body: string | null = null;
  if (normalized.body) {
    body = JSON.stringify(result.data);
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", contentType);
    }
  }
  return new Response(body, {
    status: result.status,
    headers: responseHeaders,
  });
}

async function validateResponse(
  schema: Schema,
  value: unknown,
  location: ValidationError["location"],
): Promise<void> {
  try {
    await validate(schema, value, location);
  } catch {
    throw new RouterError(500, "Route response failed validation");
  }
}

async function formatError(
  error: unknown,
  route: InternalRoute | undefined,
  context: object,
  options: RouterOptions,
  rootErrors: ReadonlyMap<number, InternalErrorDefinition>,
): Promise<Response> {
  const errors = route?.errors ?? rootErrors;
  const initialStatus = error instanceof HttpError ||
      error instanceof RouterError ||
      error instanceof ValidationError
    ? error.status
    : 500;
  const selection = selectErrorDefinition(errors, error, initialStatus);
  try {
    return await formatErrorResponse(
      error,
      selection.status,
      selection.definition,
      context,
      options,
    );
  } catch {
    const origin = route?.errorScopes.findIndex((scope) =>
      [...scope.values()].includes(selection.definition!)
    );
    if (origin !== undefined && origin >= 0) {
      for (const scope of route!.errorScopes.slice(origin + 1)) {
        const fallback = selectErrorDefinition(scope, error, initialStatus);
        if (!fallback.definition) continue;
        try {
          return await formatErrorResponse(
            error,
            fallback.status,
            fallback.definition,
            context,
            options,
          );
        } catch {
          // Try each outer registry at most once before using the safe fallback.
        }
      }
    }
    return safeInternalError();
  }
}

function selectErrorDefinition(
  errors: ReadonlyMap<number, InternalErrorDefinition>,
  error: unknown,
  status: number,
): { status: number; definition: InternalErrorDefinition | undefined } {
  const definition = [...errors.values()].find(
    (entry) =>
      typeof entry.definition !== "function" && entry.definition.match?.(error),
  );
  if (definition) return { status: definition.status, definition };
  const statusDefinition = errors.get(status) ?? errors.get(500);
  return {
    status: statusDefinition?.status ?? status,
    definition: statusDefinition,
  };
}

async function formatErrorResponse(
  error: unknown,
  status: number,
  definition: InternalErrorDefinition | undefined,
  context: object,
  options: RouterOptions,
): Promise<Response> {
  const headers = new Headers();
  let data: unknown;
  let contentType = "application/problem+json";
  if (definition) {
    const formatted = typeof definition.definition === "function"
      ? await definition.definition(error, context)
      : await definition.definition.handler(error, context);
    if (isErrorResult(formatted)) {
      data = formatted.data;
      appendHeaders(headers, formatted.headers);
    } else {
      data = formatted;
    }
    if (
      typeof definition.definition !== "function" &&
      definition.definition.headers &&
      shouldValidateResponse(options)
    ) {
      await validate(
        definition.definition.headers,
        headerValues(headers),
        "headers",
      );
    }
    if (
      typeof definition.definition !== "function" &&
      definition.definition.schema &&
      shouldValidateResponse(options)
    ) {
      await validate(definition.definition.schema, data, "body");
      contentType = "application/json";
    }
  } else {
    const problemOptions = options.problemDetails;
    const defaults = problemOptions?.defaults?.(error, status, context) ?? {};
    const message = error instanceof Error && status < 500
      ? error.message
      : undefined;
    data = {
      ...defaults,
      type: problemOptions?.type?.(error, status, context) ??
        (problemOptions?.typeBaseUrl
          ? `${problemOptions.typeBaseUrl.replace(/\/$/, "")}/${status}`
          : defaults.type),
      title: defaults.title ?? defaultTitle(status),
      ...(message ? { detail: message } : {}),
      ...(problemOptions?.instance
        ? { instance: problemOptions.instance(error, status, context) }
        : {}),
    };
  }
  headers.set("content-type", contentType);
  return new Response(JSON.stringify(data), { status, headers });
}

function safeInternalError(): Response {
  return new Response(
    JSON.stringify({ title: "Internal server error" }),
    {
      status: 500,
      headers: { "content-type": "application/problem+json" },
    },
  );
}

function isErrorResult(
  value: unknown,
): value is { readonly data: unknown; readonly headers?: HeaderValues } {
  return Boolean(value && typeof value === "object" && "data" in value);
}
function isRawResponse(value: unknown): value is RawResponse {
  return Boolean(value && typeof value === "object" && rawResponse in value);
}
function isSchema(value: unknown): value is Schema {
  return Boolean(value && typeof value === "object" && "~standard" in value);
}
function isSecurityMiddleware(value: unknown): boolean {
  return Boolean(
    value && typeof value === "function" && "__ironbaseSecurity" in value,
  );
}
function shouldValidateResponse(options: RouterOptions): boolean {
  return (
    options.responseValidation === "always" ||
    (options.responseValidation !== "off" &&
      (globalThis as any).process?.env?.NODE_ENV !== "production")
  );
}

function headerValues(headers: Headers): HeaderValues {
  const values: Record<string, string | readonly string[]> = Object.create(
    null,
  );
  for (const [key, value] of headers) values[key.toLowerCase()] = value;
  const cookies = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (cookies?.length) {
    values["set-cookie"] = cookies.length === 1 ? cookies[0]! : cookies;
  }
  return values;
}
function queryValues(url: URL): HeaderValues {
  const values: Record<string, string | readonly string[]> = Object.create(
    null,
  );
  for (const [key, value] of url.searchParams) {
    const previous = values[key];
    values[key] = previous === undefined
      ? value
      : Array.isArray(previous)
      ? [...previous, value]
      : [previous, value];
  }
  return values;
}
function decodeParams(params: Record<string, string>): Record<string, string> {
  const decoded: Record<string, string> = Object.create(null);
  try {
    for (const [key, value] of Object.entries(params)) {
      decoded[key] = decodeURIComponent(value);
    }
    return decoded;
  } catch {
    throw new RouterError(400, "Invalid path encoding");
  }
}
function appendHeaders(target: Headers, input: unknown): void {
  if (!input || typeof input !== "object") return;
  for (
    const [key, rawValue] of Object.entries(
      input as Record<string, unknown>,
    )
  ) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) target.append(key, String(value));
  }
}
function snapshotRouteOptions(
  options: RouteOptions<any, any, any>,
): RouteOptions<any, any, any> {
  const responses = Object.freeze(
    Object.fromEntries(
      Object.entries(options.responses).map(([status, definition]) => [
        status,
        isSchema(definition)
          ? definition
          : Object.freeze({ ...(definition as ResponseDefinition) }),
      ]),
    ),
  ) as ResponseDefinitions;
  const security = options.security
    ? (Object.freeze(
      options.security.map((requirement) =>
        Object.freeze(
          Object.fromEntries(
            Object.entries(requirement).map(([name, scopes]) => [
              name,
              Object.freeze([...scopes]),
            ]),
          ),
        )
      ),
    ) as readonly SecurityRequirement[])
    : undefined;
  return Object.freeze({
    ...options,
    request: options.request
      ? Object.freeze({ ...options.request })
      : undefined,
    responses,
    errors: options.errors
      ? Array.isArray(options.errors)
        ? Object.freeze([...options.errors])
        : Object.freeze({ ...options.errors })
      : undefined,
    middleware: options.middleware
      ? Object.freeze([...options.middleware])
      : undefined,
    tags: options.tags ? Object.freeze([...options.tags]) : undefined,
    security,
    extensions: options.extensions
      ? Object.freeze({ ...options.extensions })
      : undefined,
  });
}
function errorDefinitions(
  definitions: ErrorDefinitions<any> | readonly number[] | undefined,
): ReadonlyMap<number, InternalErrorDefinition> {
  const errors = new Map<number, InternalErrorDefinition>();
  if (!definitions || Array.isArray(definitions)) return errors;
  for (const [key, definition] of Object.entries(definitions)) {
    const status = Number(key);
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new TypeError(
        `Error status must be an HTTP error status: ${key}`,
      );
    }
    errors.set(status, { status, definition });
  }
  return errors;
}
function mergeErrorScopes(
  scopes: readonly ReadonlyMap<number, InternalErrorDefinition>[],
): ReadonlyMap<number, InternalErrorDefinition> {
  const merged = new Map<number, InternalErrorDefinition>();
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    for (const [status, definition] of scopes[index]!) {
      merged.set(status, definition);
    }
  }
  return merged;
}
function normalizeRoutePath(path: string, options: RouterOptions<any>): string {
  if (!path.startsWith("/")) {
    throw new TypeError(`Route paths must start with '/': ${path}`);
  }
  return normalizeIncomingPath(path, options);
}
function normalizeIncomingPath(
  path: string,
  options: RouterOptions<any>,
): string {
  let result = path || "/";
  if (options.trailingSlash === "ignore" && result.length > 1) {
    result = result.replace(/\/+$/, "");
  }
  if (options.caseSensitive === false) result = result.toLowerCase();
  return result;
}
function joinPaths(prefix: string, path: string): string {
  return prefix === "/"
    ? path
    : `${prefix.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
function allowedMethods(
  routes: readonly CompiledRoute[],
  pathname: string,
): string[] {
  const methods = new Set<string>();
  for (const route of routes) {
    if (pathMatches(route.path, pathname)) {
      if (route.method === "ALL") {
        return ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
      }
      methods.add(route.method);
      if (route.method === "GET") methods.add("HEAD");
    }
  }
  return [...methods].sort();
}
function pathMatches(pattern: string, pathname: string): boolean {
  const segments = parsePath(pattern);
  const parts = splitPath(pathname);
  let index = 0;
  for (const segment of segments) {
    if (segment.kind === "wildcard") return true;
    const value = parts[index++];
    if (
      value === undefined ||
      (segment.kind === "static" && value !== segment.value)
    ) {
      return false;
    }
  }
  return index === parts.length;
}
function validateRoute(route: CompiledRoute): void {
  for (const key of Object.keys(route.options.extensions ?? {})) {
    if (!key.startsWith("x-")) {
      throw new Error(
        `Invalid extension '${key}' on ${route.method} ${route.path}`,
      );
    }
  }
  const placeholders = parsePath(route.path)
    .filter((segment) => segment.kind === "param")
    .map((segment) => segment.name)
    .sort();
  // A Standard Schema is opaque, so exact key verification is only possible
  // for schema vendors that expose JSON Schema during OpenAPI generation.
  if (placeholders.length && !route.options.request?.params) {
    throw new Error(
      `Route ${route.method} ${route.path} has path parameters but no params schema`,
    );
  }
}
function defaultTitle(status: number): string {
  return (
    (
      {
        400: "Bad request",
        404: "Not found",
        405: "Method not allowed",
        413: "Content too large",
        415: "Unsupported media type",
        500: "Internal server error",
      } as Record<number, string>
    )[status] ?? "HTTP error"
  );
}
function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}
/** Supplies default problem members for an error. */
