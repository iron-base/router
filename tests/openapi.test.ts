import { expect, it } from "bun:test";
import { createRouter, defineSecurity } from "../src/index.ts";
import { type OpenAPI31, openapi30, openapi31 } from "../src/openapi.ts";

const numberSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (value: unknown) =>
      typeof value === "number"
        ? { value }
        : { issues: [{ message: "Expected number" }] },
    jsonSchema: {
      input: () => ({ type: "number" }),
      output: () => ({ type: "number" }),
    },
  },
};
const objectSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (value: unknown) => ({ value }),
    jsonSchema: {
      input: () => ({
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      }),
      output: () => ({
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      }),
    },
  },
};

it("generates deterministic OpenAPI 3.1 and 3.0 documents", async () => {
  const app = createRouter().get(
    "/users/{id}",
    {
      operationId: "getUser",
      request: { params: objectSchema },
      responses: { 200: objectSchema },
    },
    (request) => ({ status: 200 as const, data: request.params }),
  );
  const v31 = await app.openapi({ adapter: openapi31(), validate: true });
  const v30 = await app.openapi({ adapter: openapi30() });
  expect(v31.openapi).toBe("3.1.1");
  expect(v30.openapi).toBe("3.0.3");
  expect(v31.paths?.["/users/{id}"]?.get).toMatchObject({
    operationId: "getUser",
  });
  expect(await app.openapi({ adapter: openapi31() })).toEqual(v31);
  expect(numberSchema["~standard"].vendor).toBe("test");

  const defaultDocument: OpenAPI31.Document = await app.openapi();
  expect(defaultDocument.openapi).toBe("3.1.1");
});

it("rejects OpenAPI 3.1-only security schemes for OpenAPI 3.0", async () => {
  const mutualTls = defineSecurity({
    name: "clientCertificate",
    scheme: { type: "mutualTLS" },
    middleware: (_request, context, next) => next(context),
  });
  const app = createRouter()
    .use(mutualTls.required())
    .get("/secure", { responses: { 204: {} } }, () => ({
      status: 204 as const,
    }));

  await expect(app.openapi({ adapter: openapi30() })).rejects.toThrow(
    "OpenAPI 3.0 does not support",
  );
});

it("includes supported security schemes in OpenAPI 3.0 components", async () => {
  const apiKey = defineSecurity({
    name: "apiKey",
    scheme: { type: "apiKey", name: "x-api-key", in: "header" },
    middleware: (_request, context, next) => next(context),
  });
  const app = createRouter()
    .use(apiKey.required())
    .get("/", { responses: { 204: {} } }, () => ({ status: 204 as const }));
  const document = await app.openapi({ adapter: openapi30() });
  expect(document.components?.securitySchemes?.apiKey).toEqual({
    type: "apiKey",
    name: "x-api-key",
    in: "header",
  });
  const operation = document.paths["/"]?.get;
  expect(operation?.security).toEqual([{ apiKey: [] }]);
});

it("documents every contract location using request input and response output schemas", async () => {
  const targets: string[] = [];
  const transformed = {
    "~standard": {
      version: 1 as const,
      vendor: "transforming-test",
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: ({ target }: { target: string }) => {
          targets.push(`input:${target}`);
          return {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          };
        },
        output: ({ target }: { target: string }) => {
          targets.push(`output:${target}`);
          return {
            type: "object",
            properties: { id: { type: "number" } },
            required: ["id"],
          };
        },
      },
    },
  };
  const app = createRouter()
    .errors({
      400: () => ({ title: "Invalid input" }),
      409: {
        schema: transformed,
        headers: transformed,
        handler: () => ({ data: { id: 1 }, headers: { id: "1" } }),
      },
    })
    .post(
      "/users/{id}",
      {
        request: {
          params: transformed,
          query: transformed,
          headers: transformed,
          body: transformed,
        },
        responses: {
          201: {
            body: transformed,
            headers: transformed,
            description: "Created",
          },
          204: { description: "No body" },
        },
      },
      () => ({ status: 204 as const }),
    );

  const v31 = await app.openapi({ adapter: openapi31() });
  const operation = v31.paths?.["/users/{id}"]?.post;
  const created = operation?.responses[201] as OpenAPI31.Response;
  const validationError = operation?.responses[400] as OpenAPI31.Response;
  expect(operation?.parameters).toEqual([
    { name: "id", in: "path", required: true, schema: { type: "string" } },
    { name: "id", in: "query", required: true, schema: { type: "string" } },
    { name: "id", in: "header", required: true, schema: { type: "string" } },
  ]);
  expect(operation?.requestBody).toEqual({
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
  });
  expect(created.content?.["application/json"]?.schema).toEqual({
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
  });
  expect(created.headers).toEqual({
    id: { required: true, schema: { type: "number" } },
  });
  expect(
    validationError.content?.["application/problem+json"]?.schema,
  ).toMatchObject({
    type: "object",
  });
  const conflict = operation?.responses[409] as OpenAPI31.Response;
  expect(conflict.content?.["application/json"]?.schema).toMatchObject({
    properties: { id: { type: "number" } },
  });
  expect(conflict.headers).toEqual({
    id: { required: true, schema: { type: "number" } },
  });
  expect(targets).toContain("input:draft-2020-12");
  expect(targets).toContain("output:draft-2020-12");

  targets.length = 0;
  await app.openapi({ adapter: openapi30() });
  expect(targets).toContain("input:openapi-3.0");
  expect(targets).toContain("output:openapi-3.0");
});

it("reports unsupported schemas and invokes custom adapter validation", async () => {
  const validationOnly = {
    "~standard": {
      version: 1 as const,
      vendor: "validation-only",
      validate: (value: unknown) => ({ value }),
    },
  };
  const app = createRouter().get(
    "/",
    { responses: { 200: validationOnly } },
    () => ({ status: 200 as const, data: { ok: true } }),
  );
  await expect(app.openapi({ adapter: openapi31() })).rejects.toThrow(
    "validation-only",
  );

  let validated = false;
  const custom = {
    version: "test",
    schemaTarget: "draft-2020-12",
    build: (registry: { routes: readonly unknown[] }) => ({
      routeCount: registry.routes.length,
    }),
    validate: (document: { routeCount: number }) => {
      validated = true;
      if (document.routeCount !== 1) throw new Error("unexpected registry");
    },
  };
  expect(await app.openapi({ adapter: custom, validate: true })).toEqual({
    routeCount: 1,
  });
  expect(validated).toBe(true);
  expect(() => openapi31().validate?.({} as OpenAPI31.Document)).toThrow(
    "invalid document",
  );

  const throwingConverter = {
    "~standard": {
      version: 1 as const,
      vendor: "throwing-converter",
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: () => {
          throw new Error("unsupported keyword");
        },
        output: () => ({ type: "string" }),
      },
    },
  };
  const conversionFailure = createRouter().get(
    "/",
    { request: { query: throwingConverter }, responses: { 204: {} } },
    () => ({ status: 204 as const }),
  );
  await expect(
    conversionFailure.openapi({ adapter: openapi31() }),
  ).rejects.toThrow("throwing-converter");
});

it("handles scalar query schemas and rejects scalar path schemas", async () => {
  const scalarQuery = createRouter().get(
    "/",
    { request: { query: numberSchema }, responses: { 204: {} } },
    () => ({ status: 204 as const }),
  );
  const document = await scalarQuery.openapi({ adapter: openapi31() });
  expect(document.paths?.["/"]?.get?.parameters).toEqual([
    { name: "query", in: "query", required: false, schema: { type: "number" } },
  ]);

  const scalarPath = createRouter().get(
    "/{id}",
    { request: { params: numberSchema }, responses: { 204: {} } },
    () => ({ status: 204 as const }),
  );
  await expect(scalarPath.openapi({ adapter: openapi31() })).rejects.toThrow(
    "path parameters must produce an object schema",
  );
});
