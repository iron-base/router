import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter, defineSecurity, httpError } from "../src/index.ts";
import type { StandardSchemaV1 } from "../src/standards/schema.ts";
import { request as injectRequest } from "../src/testing.ts";

const asyncQuery: StandardSchemaV1<
  { tag: string | readonly string[]; page: string },
  { tag: string[]; page: number }
> = {
  "~standard": {
    version: 1,
    vendor: "test-async",
    types: undefined,
    validate: async (value) => {
      if (!value || typeof value !== "object") {
        return { issues: [{ message: "Expected query object" }] };
      }
      const query = value as {
        tag?: string | readonly string[];
        page?: string;
      };
      if (!query.tag || !query.page || !/^\d+$/.test(query.page)) {
        return { issues: [{ message: "Expected tag and numeric page" }] };
      }
      return {
        value: {
          tag: Array.isArray(query.tag) ? [...query.tag] : [query.tag],
          page: Number(query.page),
        },
      };
    },
  },
};

describe("router integration", () => {
  it("keeps immutable builders isolated and supports native fetch with runtime", async () => {
    const base = createRouter({
      context: async (request, runtime) => ({
        runtime: runtime as string,
        aborted: request.signal.aborted,
      }),
    });
    const left = base.get(
      "/left",
      { responses: { 200: z.object({ side: z.literal("left") }) } },
      () => ({ status: 200 as const, data: { side: "left" as const } }),
    );
    const right = base.get(
      "/right",
      {
        responses: {
          200: z.object({ runtime: z.string(), aborted: z.boolean() }),
        },
      },
      (_request, context) => ({
        status: 200 as const,
        data: context,
      }),
    );
    const controller = new AbortController();
    controller.abort();

    expect((await base.request("https://test.invalid/left")).status).toBe(404);
    expect(
      await (await left.request("https://test.invalid/left")).json(),
    ).toEqual({
      side: "left",
    });
    const response = await right.fetch(
      new Request("https://test.invalid/right", { signal: controller.signal }),
      "edge-runtime",
    );
    expect(await response.json()).toEqual({
      runtime: "edge-runtime",
      aborted: true,
    });
  });

  it("applies matching policy for HEAD, OPTIONS, methods, case, and trailing slash", async () => {
    const app = createRouter({ caseSensitive: false, trailingSlash: "ignore" })
      .get(
        "/Status",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => ({ status: 200 as const, data: { ok: true } }),
      )
      .options(
        "/explicit",
        { responses: { 200: z.object({ explicit: z.boolean() }) } },
        () => ({ status: 200 as const, data: { explicit: true } }),
      )
      .all("/all", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }));

    expect((await app.request("https://test.invalid/status/")).status).toBe(
      200,
    );
    expect(
      await (
        await app.request("https://test.invalid/status", { method: "HEAD" })
      ).text(),
    ).toBe("");
    const options = await app.request("https://test.invalid/status", {
      method: "OPTIONS",
    });
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toContain("HEAD");
    expect(
      await (
        await app.request("https://test.invalid/explicit", {
          method: "OPTIONS",
        })
      ).json(),
    ).toEqual({ explicit: true });
    const methodError = await app.request("https://test.invalid/status", {
      method: "PATCH",
    });
    expect(methodError.status).toBe(405);
    expect(methodError.headers.get("allow")).toContain("GET");
    expect(
      (await app.request("https://test.invalid/all", { method: "PATCH" }))
        .status,
    ).toBe(204);
  });

  it("validates query, lowercase headers, JSON bodies, async schemas, and invalid encodings", async () => {
    let calls = 0;
    const app = createRouter().post(
      "/items/{id}",
      {
        request: {
          params: z.object({ id: z.coerce.number() }),
          query: asyncQuery,
          headers: z.object({ "x-token": z.string() }),
          body: z.object({ name: z.string() }),
        },
        responses: {
          200: z.object({
            id: z.number(),
            page: z.number(),
            tags: z.number(),
            name: z.string(),
          }),
        },
      },
      (request) => {
        calls += 1;
        return {
          status: 200 as const,
          data: {
            id: request.params.id,
            page: request.query.page,
            tags: request.query.tag.length,
            name: request.body.name,
          },
        };
      },
    );
    const response = await app.request(
      "https://test.invalid/items/8?tag=a&tag=b&page=3",
      {
        method: "POST",
        headers: { "X-Token": "token", "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      },
    );
    expect(await response.json()).toEqual({
      id: 8,
      page: 3,
      tags: 2,
      name: "Ada",
    });
    expect(
      (
        await app.request("https://test.invalid/items/%E0%A4%A?tag=a&page=3", {
          method: "POST",
          headers: { "x-token": "token", "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request("https://test.invalid/items/8?tag=a&page=nope", {
          method: "POST",
          headers: { "x-token": "token", "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada" }),
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(1);
  });

  it("short-circuits middleware and formats duplicate next calls", async () => {
    let handlerCalls = 0;
    const shortCircuit = createRouter()
      .use(() => new Response("blocked", { status: 401 }))
      .get("/", { responses: { 200: z.object({ ok: z.boolean() }) } }, () => {
        handlerCalls += 1;
        return { status: 200 as const, data: { ok: true } };
      });
    expect(
      await (await shortCircuit.request("https://test.invalid/")).text(),
    ).toBe("blocked");
    expect(handlerCalls).toBe(0);

    const duplicate = createRouter()
      .use(async (_request, context, next) => {
        await next(context);
        return next(context);
      })
      .get("/", { responses: { 200: z.object({ ok: z.boolean() }) } }, () => ({
        status: 200 as const,
        data: { ok: true },
      }));
    const duplicateResponse = await duplicate.request("https://test.invalid/");
    expect(duplicateResponse.status).toBe(500);
    expect(await duplicateResponse.json()).toEqual({
      title: "Internal server error",
      status: 500,
    });
  });

  it("inherits mount context and errors without changing sibling routes", async () => {
    const child = createRouter<{ requestId: string }>()
      .use<{ child: true }>((_request, context, next) =>
        next({ ...context, child: true })
      )
      .get(
        "/",
        {
          responses: {
            200: z.object({ requestId: z.string(), child: z.boolean() }),
          },
        },
        (_request, context) => ({ status: 200 as const, data: context }),
      )
      .get(
        "/missing",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => {
          throw httpError(404, {});
        },
      );
    const app = createRouter()
      .use<{ requestId: string }>((_request, context, next) =>
        next({ ...context, requestId: "r1" })
      )
      .errors({
        404: (_error, context) => ({ title: `Missing ${context.requestId}` }),
      })
      .mount("/one", child)
      .mount("/two", child)
      .get(
        "/sibling",
        { responses: { 200: z.object({ sibling: z.boolean() }) } },
        () => ({ status: 200 as const, data: { sibling: true } }),
      );

    expect(
      await (await app.request("https://test.invalid/one/")).json(),
    ).toEqual({ requestId: "r1", child: true });
    expect(
      await (await app.request("https://test.invalid/two/")).json(),
    ).toEqual({ requestId: "r1", child: true });
    expect(
      await (await app.request("https://test.invalid/one/missing")).json(),
    ).toEqual({ title: "Missing r1", status: 404 });
    expect(
      await (await app.request("https://test.invalid/sibling")).json(),
    ).toEqual({ sibling: true });
  });

  it("classifies errors, protects formatter failures, and validates declared responses", async () => {
    class Conflict extends Error {}
    const classified = createRouter({ responseValidation: "always" })
      .errors({
        409: {
          match: (error): error is Conflict => error instanceof Conflict,
          handler: () => ({ data: { code: "CONFLICT" } }),
        },
        500: () => {
          throw new Error("formatter failure");
        },
      })
      .get(
        "/conflict",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => {
          throw new Conflict();
        },
      )
      .get(
        "/invalid",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => ({ status: 200 as const, data: { ok: "wrong" } as never }),
      )
      .get(
        "/unknown",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => {
          throw new Error("secret internal detail");
        },
      );
    expect(
      await (await classified.request("https://test.invalid/conflict")).json(),
    ).toEqual({
      code: "CONFLICT",
      status: 409,
    });
    const invalid = await classified.request("https://test.invalid/invalid");
    expect(invalid.status).toBe(500);
    const unknown = await classified.request("https://test.invalid/unknown");
    expect(await unknown.json()).toEqual({
      title: "Internal server error",
      status: 500,
    });
  });

  it("applies security middleware and exposes runtime policy metadata", async () => {
    const bearer = defineSecurity<{ user?: string }, { user: string }>({
      name: "bearerAuth",
      scheme: { type: "http", scheme: "bearer" },
      middleware: (request, context, next) => {
        const token = request.headers.get("authorization");
        if (!token) throw httpError(401, {});
        return next({ ...context, user: token });
      },
    });
    const app = createRouter()
      .errors({ 401: () => ({ title: "Unauthorized" }) })
      .use(bearer.required())
      .get(
        "/private",
        { responses: { 200: z.object({ user: z.string() }) } },
        (_request, context) => ({
          status: 200 as const,
          data: { user: context.user },
        }),
      );
    expect((await app.request("https://test.invalid/private")).status).toBe(
      401,
    );
    expect(
      await (
        await app.request("https://test.invalid/private", {
          headers: { authorization: "Bearer token" },
        })
      ).json(),
    ).toEqual({ user: "Bearer token" });
    expect(app.compile().registry.securitySchemes.bearerAuth).toEqual({
      type: "http",
      scheme: "bearer",
    });
  });

  it("registers each explicit HTTP method and policy mode", async () => {
    const app = createRouter()
      .put("/put", { responses: { 204: {} } }, () => ({ status: 204 as const }))
      .patch("/patch", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }))
      .delete("/delete", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }))
      .head("/head", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }));
    for (
      const [path, method] of [
        ["/put", "PUT"],
        ["/patch", "PATCH"],
        ["/delete", "DELETE"],
        ["/head", "HEAD"],
      ] as const
    ) {
      expect(
        (await app.request(`https://test.invalid${path}`, { method })).status,
      ).toBe(204);
    }

    const policy = defineSecurity<{}, { identity?: string }>({
      name: "optionalAuth",
      scheme: { type: "apiKey", name: "x-api-key", in: "header" },
      middleware: (request, context, next) =>
        next({
          ...context,
          identity: request.headers.get("x-api-key") ?? undefined,
        }),
    });
    const optional = createRouter()
      .use(policy.optional())
      .get(
        "/",
        { responses: { 200: z.object({ hasIdentity: z.boolean() }) } },
        (_request, context) => ({
          status: 200 as const,
          data: { hasIdentity: Boolean(context.identity) },
        }),
      );
    const metadataOnly = createRouter()
      .use(policy.metadataOnly())
      .get("/", { responses: { 204: {} } }, () => ({ status: 204 as const }));
    expect(
      await (await optional.request("https://test.invalid/")).json(),
    ).toEqual({ hasIdentity: false });
    expect(
      await (
        await optional.request("https://test.invalid/", {
          headers: { "x-api-key": "key" },
        })
      ).json(),
    ).toEqual({ hasIdentity: true });
    expect((await metadataOnly.request("https://test.invalid/")).status).toBe(
      204,
    );
  });

  it("mounts through use(child) and exposes equivalent request injection", async () => {
    const child = createRouter().get(
      "/child",
      { responses: { 200: z.object({ mounted: z.boolean() }) } },
      () => ({ status: 200 as const, data: { mounted: true } }),
    );
    const app = createRouter().use(child);
    const direct = await app.request("https://test.invalid/child");
    const injected = await injectRequest(app, "https://test.invalid/child");
    expect(direct.status).toBe(injected.status);
    expect(await injected.json()).toEqual({ mounted: true });
  });
});
