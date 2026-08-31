# `@ironbase/router`

> A Fetch-native TypeScript router with Standard Schema validation, immutable context composition, status-aware responses, and typed OpenAPI 3.0/3.1 output.

`@ironbase/router` is a small HTTP orchestration layer for JSON APIs. A route contract is the source of truth for runtime validation, handler input and output types, response serialization, errors, and OpenAPI operations.

## Install

```sh
bun add @ironbase/router
```

Runtime validation schemas are supplied by the application. The examples use Zod, but the core has no runtime dependency on a specific schema library.

## Quick Start

```ts
import { createRouter, httpError } from "@ironbase/router";
import { z } from "zod";

const users = new Map([["1", { id: 1, name: "Ada Lovelace" }]]);

const app = createRouter()
  .errors({
    404: (error) => ({
      title: "User not found",
      detail: error instanceof Error ? error.message : undefined,
    }),
  })
  .get(
    "/users/{id}",
    {
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
      },
      responses: {
        200: z.object({ id: z.number(), name: z.string() }),
      },
    },
    (request) => {
      const user = users.get(String(request.params.id));
      if (!user) throw httpError(404, { userId: request.params.id });
      return { status: 200 as const, data: user };
    },
  );

const response = await app.request("https://api.example.test/users/1");
```

Use `compile()` during application startup to freeze the route registry and build the matcher:

```ts
const compiled = app.compile();

export default {
  fetch: compiled.fetch,
};
```

`router.fetch(request, runtime?)` and `router.request(input, init?, runtime?)` both dispatch through the same compiled runtime. Request injection accepts an absolute URL or native `Request`.

## Route Contracts

Routes can validate `params`, `query`, `headers`, and a JSON `body`. Handler values use each schema's output type; schemas that transform values therefore expose transformed values to the handler.

```ts
app.post(
  "/users/{id}",
  {
    request: {
      params: z.object({ id: z.coerce.number() }),
      query: z.object({ notify: z.coerce.boolean().default(false) }),
      headers: z.object({ "x-request-id": z.string() }),
      body: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        body: z.object({ id: z.number(), name: z.string() }),
        headers: z.object({ "x-request-id": z.string() }),
        description: "Updated user",
      },
      204: { description: "No change" },
    },
  },
  (request) => ({
    status: 200 as const,
    data: { id: request.params.id, name: request.body.name },
    headers: { "x-request-id": request.headers["x-request-id"] },
  }),
);
```

- Headers are normalized to lowercase before validation; native headers remain available as `request.raw.headers`.
- Query and header repetition is represented as `string | readonly string[]` before schema validation.
- JSON bodies reject unsupported media types with `415` and apply the configured `bodyLimit` before buffering.
- Response validation defaults to `development`; choose `off`, `development`, or `always` with `responseValidation`.
- Response status literals should use `as const` in generic callbacks so TypeScript retains the declared discriminant.
- Return `raw(new Response(...))` only for an explicit native-response escape hatch.

Runtime validation accepts [`StandardSchemaV1`](https://standardschema.dev/schema). OpenAPI generation additionally needs [`StandardJSONSchemaV1`](https://standardschema.dev/json-schema). Standard Schema does not provide schema composition APIs, so composition remains library-native.

## Context And Middleware

Every dispatch receives fresh context. Middleware wraps downstream middleware and handlers, may short-circuit by returning a response, and may call `next()` only once.

```ts
const app = createRouter()
  .use<{ requestId: string }>((_request, context, next) =>
    next({ ...context, requestId: crypto.randomUUID() }),
  )
  .get(
    "/health",
    { responses: { 200: z.object({ ok: z.boolean(), requestId: z.string() }) } },
    (_request, context) => ({
      status: 200 as const,
      data: { ok: true, requestId: context.requestId },
    }),
  );
```

Builder calls are immutable. Give context-adding middleware an explicit generic when its added shape cannot be inferred from a reusable middleware value.

Mounted routers receive parent context plus their own additions. A reusable child can declare the parent context it requires:

```ts
type ParentContext = { requestId: string };

const child = createRouter<ParentContext>()
  .use<{ user: { id: string } }>((_request, context, next) =>
    next({ ...context, user: { id: "demo" } }),
  );

const parent = createRouter()
  .use<ParentContext>((_request, context, next) =>
    next({ ...context, requestId: crypto.randomUUID() }),
  )
  .mount("/users", child);
```

The child's `user` capability remains scoped to its subtree. `parent.use(child)` is shorthand for mounting at `/`.

## Errors

Throw `httpError(status, details)` for expected failures. Built-in router failures and unknown exceptions are shaped as Problem Details responses; unknown `500` failures do not disclose arbitrary error messages, causes, or stacks.

```ts
const app = createRouter({
  problemDetails: { typeBaseUrl: "https://api.example.test/problems" },
}).errors({
  404: () => ({ title: "Not found" }),
  409: {
    schema: z.object({ code: z.literal("CONFLICT"), resource: z.string() }),
    handler: (error) => ({
      data: {
        code: "CONFLICT" as const,
        resource: error instanceof Error ? error.message : "unknown",
      },
    }),
  },
});
```

Error definitions are inherited by mounted children. A child definition for a status overrides the parent only in that subtree. Long-form definitions can classify third-party errors with `match`, validate custom error bodies, and declare error response headers.

## Security

`defineSecurity()` couples a named OpenAPI security scheme with context-refining middleware:

```ts
const bearer = defineSecurity<{}, { subject: string }>({
  name: "bearerAuth",
  scheme: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  middleware: (request, context, next) => {
    const value = request.headers.get("authorization");
    if (!value?.startsWith("Bearer ")) throw httpError(401, {});
    return next({ ...context, subject: value.slice(7) });
  },
});

const privateApi = createRouter().use(bearer.required());
const optionalApi = createRouter().use(bearer.optional());
const documentedOnly = createRouter().use(bearer.metadataOnly());
```

Required policies appear in generated operation security requirements. The `metadataOnly()` mode is explicit and does not run the policy middleware.

## OpenAPI

OpenAPI metadata is generated from the compiled route registry. `router.openapi()` defaults to a typed `OpenAPI31.Document`; OpenAPI 3.0 is explicit.

```ts
import { openapi30, openapi31 } from "@ironbase/router/openapi";

const openapi31Document = await app.openapi({ adapter: openapi31(), validate: true });
const openapi30Document = await app.openapi({ adapter: openapi30() });
```

- OpenAPI 3.1 requests JSON Schema `draft-2020-12` from schema converters.
- OpenAPI 3.0 requests the `openapi-3.0` target.
- Request schemas use a converter's input representation; success and custom error responses use its output representation.
- `OpenAPI30` and `OpenAPI31` type namespaces describe documents, paths, operations, components, security schemes, and version-specific schema rules.
- OpenAPI 3.0 rejects 3.1-only `mutualTLS` security schemes.

## Matching And HTTP Policy

The default matcher prioritizes static segments, then named parameters (`{id}`), then wildcards (`*rest`). It supports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `ALL` routes.

- A `GET` route supplies automatic `HEAD` behavior unless an explicit `HEAD` route exists.
- Unknown paths return `404`; known paths with unsupported methods return `405` and `Allow`.
- Automatic `OPTIONS` returns `204` and `Allow`; explicit `OPTIONS` routes take precedence.
- Configure case matching with `caseSensitive` and trailing-slash behavior with `trailingSlash: "ignore"`.

The public matcher interface is available from `@ironbase/router/matchers`.

## Testing

Use native request injection without opening a port:

```ts
import { request } from "@ironbase/router/testing";

const response = await request(app, "https://api.example.test/health");
```

The repository verifies runtime behavior, type contracts, OpenAPI output, and matcher properties:

```sh
bun run check
bun test --coverage
```

## Benchmarking

The in-process benchmarks dispatch native Fetch `Request` objects through a
compiled router and consume each `Response`. They do not start `Bun.serve()` or
open a network port.

```sh
bun run bench
bun --cpu-prof bench/*.ts
```

The CPU-profile command writes a `*.cpuprofile` file that can be loaded in
Chrome DevTools or VS Code. Use `--cpu-prof-md` as well for a Markdown profile.
The suite covers minimal static dispatch, request and response validation with a
JSON body, and lookup through 250 registered routes.

## Examples

Each example is directly executable with Bun and type-checked with the package:

- [`examples/basic.ts`](./examples/basic.ts): route contracts and `httpError()`.
- [`examples/middleware.ts`](./examples/middleware.ts): context-refining middleware.
- [`examples/composition.ts`](./examples/composition.ts): reusable router requirements and mounting.
- [`examples/errors.ts`](./examples/errors.ts): Problem Details and custom error bodies.
- [`examples/security.ts`](./examples/security.ts): bearer policy enforcement.
- [`examples/openapi.ts`](./examples/openapi.ts): typed OpenAPI 3.0 and 3.1 generation.
- [`examples/testing.ts`](./examples/testing.ts): request injection.

## Boundaries

The current implementation focuses on portable JSON APIs. Streaming, multipart bodies, cookies, multiple media types, WebSockets, SSE, file-system routing, server lifecycle management, dependency injection, OpenAPI UI, and client generation are outside the current scope.

## References

The router's design and test corpus are informed by these projects:

- [Hono](https://github.com/honojs/hono): Fetch-native routing and router conformance cases.
- [Elysia](https://github.com/elysiajs/elysia): TypeScript-first route contracts and inference ergonomics.
- [Fastify](https://github.com/fastify/fastify): route lifecycle and HTTP behavior testing practices.
- [Express](https://github.com/expressjs/express): established middleware and router composition semantics.

## Documentation

- [API design](./API-DESIGN.md)
- [Requirements](./REQUIREMENTS.md)
- [Test plan](./TEST-PLAN.md)

## Contributing

Contributions are welcome. See the [contributing guide](./CONTRIBUTING.md) for
development setup, quality checks, pull request expectations, and the release
process.

## License

This project is licensed under the [MIT License](./LICENSE).
