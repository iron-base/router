import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter, defineSecurity, httpError } from "../src/index.ts";

describe("router composition", () => {
  it("nests parent, child, and route middleware in lifecycle order", async () => {
    const events: string[] = [];
    const child = createRouter<{ requestId: string }>()
      .use<{ child: true }>(async (_request, context, next) => {
        events.push("child-before");
        const response = await next({ ...context, child: true });
        events.push("child-after");
        return response;
      })
      .get(
        "/items/{id}",
        {
          request: { params: z.object({ id: z.string() }) },
          middleware: [
            async (_request, context, next) => {
              events.push("route-before");
              const response = await next(context);
              events.push("route-after");
              return response;
            },
          ],
          responses: {
            200: z.object({ requestId: z.string(), id: z.string() }),
          },
        },
        (request, context) => {
          events.push("handler");
          return {
            status: 200 as const,
            data: { requestId: context.requestId, id: request.params.id },
          };
        },
      );
    const app = createRouter()
      .use<{ requestId: string }>(async (_request, context, next) => {
        events.push("parent-before");
        const response = await next({ ...context, requestId: "parent" });
        events.push("parent-after");
        return response;
      })
      .mount("/api", child);

    const response = await app.request("https://test.invalid/api/items/42");
    expect(await response.json()).toEqual({ requestId: "parent", id: "42" });
    expect(events).toEqual([
      "parent-before",
      "child-before",
      "route-before",
      "handler",
      "route-after",
      "child-after",
      "parent-after",
    ]);
  });

  it("keeps context isolated between concurrent requests", async () => {
    const app = createRouter({
      context: async (request) => ({
        requestId: request.headers.get("x-request-id")!,
      }),
    }).get(
      "/",
      { responses: { 200: z.object({ requestId: z.string() }) } },
      async (_request, context) => {
        await Promise.resolve();
        return { status: 200 as const, data: context };
      },
    );

    const responses = await Promise.all(
      ["one", "two", "three"].map(async (requestId) => {
        const response = await app.request("https://test.invalid/", {
          headers: { "x-request-id": requestId },
        });
        return response.json();
      }),
    );
    expect(responses).toEqual([
      { requestId: "one" },
      { requestId: "two" },
      { requestId: "three" },
    ]);
  });

  it("keeps child error overrides isolated from parent fallbacks and siblings", async () => {
    const child = createRouter()
      .errors({ 404: () => ({ title: "Child missing" }) })
      .get("/missing", { responses: { 204: {} } }, () => {
        throw httpError(404, {});
      });
    const app = createRouter()
      .errors({ 404: () => ({ title: "Parent missing" }) })
      .mount("/child", child)
      .get("/sibling", { responses: { 204: {} } }, () => {
        throw httpError(404, {});
      });

    expect(
      await (await app.request("https://test.invalid/child/missing")).json(),
    ).toEqual({ title: "Child missing", status: 404 });
    expect(
      await (await app.request("https://test.invalid/sibling")).json(),
    ).toEqual({ title: "Parent missing", status: 404 });
  });

  it("falls back to the parent error formatter when a child formatter fails", async () => {
    const child = createRouter()
      .errors({
        500: () => {
          throw new Error("child formatter failed");
        },
      })
      .get("/", { responses: { 204: {} } }, () => {
        throw new Error("handler failed");
      });
    const app = createRouter()
      .errors({ 500: () => ({ title: "Parent fallback" }) })
      .mount("/child", child);

    const response = await app.request("https://test.invalid/child/");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      title: "Parent fallback",
      status: 500,
    });
  });

  it("keeps explicitly public routes out of inherited security enforcement", async () => {
    const bearer = defineSecurity<{}, { user: string }>({
      name: "bearerAuth",
      scheme: { type: "http", scheme: "bearer" },
      middleware: (request, context, next) => {
        const user = request.headers.get("authorization");
        if (!user) throw httpError(401, {});
        return next({ ...context, user });
      },
    });
    const app = createRouter()
      .use(bearer.required())
      .get("/private", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }))
      .get("/public", { security: [], responses: { 204: {} } }, () => ({
        status: 204 as const,
      }));

    expect((await app.request("https://test.invalid/private")).status).toBe(
      401,
    );
    expect((await app.request("https://test.invalid/public")).status).toBe(204);
    const document = await app.openapi();
    expect(document.paths?.["/public"]?.get?.security).toEqual([]);
  });
});
