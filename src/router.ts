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

export interface OpenAPIInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly termsOfService?: string;
  readonly contact?: {
    readonly name?: string;
    readonly url?: string;
    readonly email?: string;
  };
  readonly license?: { readonly name: string; readonly url?: string };
}
export type OpenAPISecurityScheme =
  | OpenAPI30.SecurityScheme
  | OpenAPI31.SecurityScheme;

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "ALL";
export type Schema = StandardSchemaV1<any, any>;
export type InferInput<S> = S extends Schema
  ? StandardSchemaV1.InferInput<S>
  : undefined;
export type InferOutput<S> = S extends Schema
  ? StandardSchemaV1.InferOutput<S>
  : undefined;

type HeaderValues = Record<string, string | readonly string[]>;
type MaybePromise<T> = T | Promise<T>;
type ExtensionMap = Record<`x-${string}`, unknown>;

export interface RequestContract<
  Params extends Schema | undefined = Schema | undefined,
  Query extends Schema | undefined = Schema | undefined,
  Headers extends Schema | undefined = Schema | undefined,
  Body extends Schema | undefined = Schema | undefined,
> {
  readonly params?: Params;
  readonly query?: Query;
  readonly headers?: Headers;
  readonly body?: Body;
}

export interface RouteRequest<Params, Query, Headers, Body> {
  readonly raw: Request;
  readonly params: Params;
  readonly query: Query;
  readonly headers: Headers;
  readonly body: Body;
}

type RequestFor<C extends RequestContract | undefined> = RouteRequest<
  C extends RequestContract ? InferOutput<C["params"]> : undefined,
  C extends RequestContract ? InferOutput<C["query"]> : undefined,
  C extends RequestContract ? InferOutput<C["headers"]> : undefined,
  C extends RequestContract ? InferOutput<C["body"]> : undefined
>;

export interface ResponseDefinition<
  Body extends Schema | undefined = Schema | undefined,
  Headers extends Schema | undefined = Schema | undefined,
> {
  readonly body?: Body;
  readonly headers?: Headers;
  readonly description?: string;
  readonly contentType?: string;
}

export type ResponseDefinitions = Record<
  number,
  Schema | ResponseDefinition<Schema | undefined, Schema | undefined>
>;

type ResultHeaders<Definition> = Definition extends {
  readonly headers: infer Headers extends Schema;
}
  ? { readonly headers: InferOutput<Headers> }
  : { readonly headers?: HeaderValues };
type ResultForDefinition<
  Status extends number,
  Definition,
> = Definition extends Schema
  ? { readonly status: Status; readonly data: InferOutput<Definition> } & {
      readonly headers?: HeaderValues;
    }
  : Definition extends ResponseDefinition
    ? Definition extends { readonly body: infer Body extends Schema }
      ? {
          readonly status: Status;
          readonly data: InferOutput<Body>;
        } & ResultHeaders<Definition>
      : { readonly status: Status } & ResultHeaders<Definition>
    : never;
export type HandlerResult<Responses extends ResponseDefinitions> = {
  [Status in keyof Responses & number]: ResultForDefinition<
    Status,
    Responses[Status]
  >;
}[keyof Responses & number];

export interface RawResponse {
  readonly response: Response;
  readonly [rawResponse]: true;
}
const rawResponse = Symbol("ironbase.raw-response");

/** Explicitly returns a native response without contract serialization. */
export function raw(response: Response): RawResponse {
  return { response, [rawResponse]: true };
}

export interface Middleware<ParentContext = object, AddedContext = object> {
  (
    request: Request,
    context: ParentContext,
    next: (context: ParentContext & AddedContext) => Promise<Response>,
  ): MaybePromise<Response>;
}

export interface ProblemDetails {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly [extension: string]: unknown;
}

export interface ProblemDetailsOptions<Context> {
  readonly typeBaseUrl?: string;
  readonly type?: (error: unknown, status: number, context: Context) => string;
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

export interface ErrorDefinition<Context = object> {
  readonly match?: (error: unknown) => boolean;
  readonly schema?: Schema;
  readonly headers?: Schema;
  readonly handler: (
    error: unknown,
    context: Context,
  ) => MaybePromise<
    ProblemDetails | { readonly data: unknown; readonly headers?: HeaderValues }
  >;
}
export type ErrorDefinitions<Context> = Record<
  number,
  | ((error: unknown, context: Context) => MaybePromise<ProblemDetails>)
  | ErrorDefinition<Context>
>;

export interface RouteOptions<
  RequestContractType extends RequestContract | undefined =
    | RequestContract
    | undefined,
  Responses extends ResponseDefinitions = ResponseDefinitions,
  Context = object,
> {
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly deprecated?: boolean;
  readonly security?: readonly SecurityRequirement[];
  readonly request?: RequestContractType;
  readonly responses: Responses;
  readonly errors?: readonly number[];
  readonly middleware?: readonly Middleware<Context, any>[];
  readonly extensions?: ExtensionMap;
}

export interface SecurityRequirement {
  readonly [scheme: string]: readonly string[];
}

export interface SecurityPolicy<Context = object, AddedContext = object> {
  required(): Middleware<Context, AddedContext>;
  optional(): Middleware<Context, AddedContext>;
  metadataOnly(): Middleware<Context, AddedContext>;
  readonly name: string;
  readonly scheme: OpenAPISecurityScheme;
}

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
    const middleware =
      mode === "metadataOnly"
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

export interface OpenAPIAdapter<Document = unknown> {
  readonly version: string;
  readonly schemaTarget: string;
  build(registry: CompiledRouteRegistry): MaybePromise<Document>;
  validate?(document: Document): MaybePromise<void>;
}

export interface RouterOptions<Context extends object = object> {
  readonly context?: (
    request: Request,
    runtime: unknown,
  ) => MaybePromise<Context>;
  readonly matcher?: () => RouteMatcher<CompiledRoute>;
  readonly trailingSlash?: "strict" | "ignore";
  readonly caseSensitive?: boolean;
  readonly autoOptions?: boolean;
  readonly bodyLimit?: number;
  readonly responseValidation?: "off" | "development" | "always";
  readonly problemDetails?: ProblemDetailsOptions<Context>;
  readonly openapi?: {
    readonly adapter?: OpenAPIAdapter;
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
    | ErrorDefinition<any>;
}
interface State {
  readonly options: RouterOptions<any>;
  readonly scopes: readonly Scope[];
  readonly routes: readonly InternalRoute[];
  readonly errors: ReadonlyMap<number, InternalErrorDefinition>;
  readonly security: ReadonlyMap<string, SecurityMetadata>;
}

export interface CompiledRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly options: RouteOptions<any, any, any>;
  readonly route: InternalRoute;
}
export interface CompiledRouteRegistry {
  readonly routes: readonly CompiledRoute[];
  readonly securitySchemes: Readonly<Record<string, OpenAPISecurityScheme>>;
  readonly info?: OpenAPIInfo;
}

export interface CompiledRouter<Runtime = unknown> {
  fetch(request: Request, runtime?: Runtime): Promise<Response>;
  request(
    input: string | Request,
    init?: RequestInit,
    runtime?: Runtime,
  ): Promise<Response>;
  readonly registry: CompiledRouteRegistry;
}

export class Router<
  Context extends object = object,
  Requirements extends object = object,
> {
  #state: State;
  #compiled?: CompiledRouter;

  constructor(state: State) {
    this.#state = state;
  }

  use<AddedContext extends object>(
    middleware: Middleware<Context, AddedContext>,
  ): Router<Context & AddedContext, Requirements>;
  use<ChildContext extends object, ChildRequirements extends object>(
    child: Router<ChildContext, ChildRequirements> &
      (Context extends ChildRequirements ? unknown : never),
  ): Router<Context, Requirements>;
  use(value: Middleware<any, any> | Router<any>): Router<any> {
    if (value instanceof Router)
      return this.mount(
        "/",
        value as Router<any, any> & (Context extends any ? unknown : never),
      );
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

  errors(
    definitions: ErrorDefinitions<Context>,
  ): Router<Context, Requirements> {
    const errors = new Map(this.#state.errors);
    for (const [key, definition] of Object.entries(definitions)) {
      const status = Number(key);
      if (!Number.isInteger(status) || status < 400 || status > 599) {
        throw new TypeError(
          `Error status must be an HTTP error status: ${key}`,
        );
      }
      errors.set(status, { status, definition });
    }
    return new Router({ ...this.#state, errors });
  }

  mount<ChildContext extends object, ChildRequirements extends object>(
    prefix: string,
    child: Router<ChildContext, ChildRequirements> &
      (Context extends ChildRequirements ? unknown : never),
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
  ): Router<Context, Requirements> {
    return this.#route("GET", path, options, handler);
  }
  post<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("POST", path, options, handler);
  }
  put<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("PUT", path, options, handler);
  }
  patch<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("PATCH", path, options, handler);
  }
  delete<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("DELETE", path, options, handler);
  }
  head<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("HEAD", path, options, handler);
  }
  options<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("OPTIONS", path, options, handler);
  }
  all<Path extends string, Options extends RouteOptions<any, any, Context>>(
    path: Path,
    options: Options,
    handler: RouteHandler<NoInfer<Options>, Context>,
  ): Router<Context, Requirements> {
    return this.#route("ALL", path, options, handler);
  }

  compile(): CompiledRouter {
    if (this.#compiled) return this.#compiled;
    const options = this.#state.options;
    const matcher =
      options.matcher?.() ?? new DefaultRouteMatcher<CompiledRoute>();
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
      if (previous)
        throw new Error(
          `Duplicate route ${key}; already registered at ${previous.path}`,
        );
      seen.set(key, route);
      validateRoute(route);
      if (route.options.operationId) {
        const previousOperation = operationIds.get(route.options.operationId);
        if (previousOperation)
          throw new Error(
            `Duplicate operationId '${route.options.operationId}' for ${route.method} ${route.path} and ${previousOperation.method} ${previousOperation.path}`,
          );
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
        const request =
          input instanceof Request ? input : new Request(input, init);
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

  fetch(request: Request, runtime?: unknown): Promise<Response> {
    return this.compile().fetch(request, runtime);
  }

  request(
    input: string | Request,
    init?: RequestInit,
    runtime?: unknown,
  ): Promise<Response> {
    return this.compile().request(input, init, runtime);
  }

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
      if (options.validate && adapter.validate)
        await adapter.validate(document);
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
    const route: InternalRoute = {
      method,
      path: normalizeRoutePath(path, this.#state.options),
      options: snapshotRouteOptions(options),
      handler: handler as InternalRoute["handler"],
      scopes: this.#state.scopes,
      errors: this.#state.errors,
      errorScopes: [this.#state.errors],
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
    route = matcher.match(method, pathname)?.route;
    let headFromGet = false;
    if (!route && method === "HEAD") {
      route = matcher.match("GET", pathname)?.route;
      headFromGet = Boolean(route);
    }
    if (!route) {
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
    const match = matcher.match(headFromGet ? "GET" : method, pathname);
    if (!match) throw new RouterError(404, "Not found");
    const scopes =
      route.route.options.security?.length === 0
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
    if (called)
      throw new RouterError(500, "Middleware called next() more than once");
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
  const params = decodeParams(rawParams);
  const validatedParams = contract?.params
    ? await validate(contract.params, params, "params")
    : undefined;
  const query = queryValues(new URL(request.url));
  const validatedQuery = contract?.query
    ? await validate(contract.query, query, "query")
    : undefined;
  const headers = headerValues(request.headers);
  const validatedHeaders = contract?.headers
    ? await validate(contract.headers, headers, "headers")
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
          typeof segment === "object" ? segment.key : segment,
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
  if (type !== "application/json" && !type?.endsWith("+json"))
    throw new RouterError(415, "Unsupported media type");
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit)
    throw new RouterError(413, "Request body too large");
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
  if (!definition)
    throw new RouterError(500, `Undeclared response status ${result.status}`);
  const normalized = isSchema(definition)
    ? { body: definition, contentType: "application/json" }
    : definition;
  if (!normalized.body && "data" in result)
    throw new RouterError(
      500,
      `Status ${result.status} does not declare a response body`,
    );
  if (normalized.body && shouldValidateResponse(options))
    await validateResponse(normalized.body, result.data, "body");
  const responseHeaders = new Headers();
  appendHeaders(responseHeaders, result.headers);
  if (normalized.headers && shouldValidateResponse(options))
    await validateResponse(
      normalized.headers,
      headerValues(responseHeaders),
      "headers",
    );
  const contentType = normalized.contentType ?? "application/json";
  let body: string | null = null;
  if (normalized.body) {
    body = JSON.stringify(result.data);
    if (!responseHeaders.has("content-type"))
      responseHeaders.set("content-type", contentType);
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
  const initialStatus =
    error instanceof HttpError ||
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
      [...scope.values()].includes(selection.definition!),
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
    const formatted =
      typeof definition.definition === "function"
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
    const message =
      error instanceof Error && status < 500 ? error.message : undefined;
    data = {
      ...defaults,
      type:
        problemOptions?.type?.(error, status, context) ??
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
  if (data && typeof data === "object")
    data = { ...(data as Record<string, unknown>), status };
  headers.set("content-type", contentType);
  return new Response(JSON.stringify(data), { status, headers });
}

function safeInternalError(): Response {
  return new Response(
    JSON.stringify({ title: "Internal server error", status: 500 }),
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
  const values: Record<string, string | readonly string[]> =
    Object.create(null);
  for (const [key, value] of headers) values[key.toLowerCase()] = value;
  const cookies = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (cookies?.length)
    values["set-cookie"] = cookies.length === 1 ? cookies[0]! : cookies;
  return values;
}
function queryValues(url: URL): HeaderValues {
  const values: Record<string, string | readonly string[]> =
    Object.create(null);
  for (const [key, value] of url.searchParams) {
    const previous = values[key];
    values[key] =
      previous === undefined
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
    for (const [key, value] of Object.entries(params))
      decoded[key] = decodeURIComponent(value);
    return decoded;
  } catch {
    throw new RouterError(400, "Invalid path encoding");
  }
}
function appendHeaders(target: Headers, input: unknown): void {
  if (!input || typeof input !== "object") return;
  for (const [key, rawValue] of Object.entries(
    input as Record<string, unknown>,
  )) {
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
          ),
        ),
      ) as readonly SecurityRequirement[])
    : undefined;
  return Object.freeze({
    ...options,
    request: options.request
      ? Object.freeze({ ...options.request })
      : undefined,
    responses,
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
function mergeErrorScopes(
  scopes: readonly ReadonlyMap<number, InternalErrorDefinition>[],
): ReadonlyMap<number, InternalErrorDefinition> {
  const merged = new Map<number, InternalErrorDefinition>();
  for (let index = scopes.length - 1; index >= 0; index -= 1)
    for (const [status, definition] of scopes[index]!)
      merged.set(status, definition);
  return merged;
}
function normalizeRoutePath(path: string, options: RouterOptions): string {
  if (!path.startsWith("/"))
    throw new TypeError(`Route paths must start with '/': ${path}`);
  return normalizeIncomingPath(path, options);
}
function normalizeIncomingPath(path: string, options: RouterOptions): string {
  let result = path || "/";
  if (options.trailingSlash === "ignore" && result.length > 1)
    result = result.replace(/\/+$/, "");
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
  for (const route of routes)
    if (pathMatches(route.path, pathname)) {
      if (route.method === "ALL")
        return ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
      methods.add(route.method);
      if (route.method === "GET") methods.add("HEAD");
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
    )
      return false;
  }
  return index === parts.length;
}
function validateRoute(route: CompiledRoute): void {
  for (const key of Object.keys(route.options.extensions ?? {})) {
    if (!key.startsWith("x-"))
      throw new Error(
        `Invalid extension '${key}' on ${route.method} ${route.path}`,
      );
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
