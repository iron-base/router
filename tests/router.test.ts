import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter, httpError, raw } from "../src/index.ts";

describe("router dispatch", () => {
  it("validates typed request inputs and serializes a declared response", async () => {
    const app = createRouter().post(
      "/users/{id}",
      {
        request: {
          params: z.object({ id: z.coerce.number().int() }),
          query: z.object({
            tag: z.union([z.string(), z.array(z.string())]).optional(),
          }),
          headers: z.object({ "x-token": z.string() }),
          body: z.object({ name: z.string() }),
        },
        responses: { 200: z.object({ id: z.number(), name: z.string() }) },
      },
      (request) => ({
        status: 200 as const,
        data: { id: request.params.id, name: request.body.name },
      }),
    );

    const response = await app.request(
      "https://example.test/users/4?tag=one&tag=two",
      {
        method: "POST",
        headers: { "X-Token": "ok", "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      },
    );
    expect(await response.json()).toEqual({ id: 4, name: "Ada" });

    const getApp = createRouter().get(
      "/users/{id}",
      {
        request: {
          params: z.object({ id: z.coerce.number().int() }),
          headers: z.object({ "x-token": z.string() }),
        },
        responses: { 200: z.object({ id: z.number() }) },
      },
      (request) => ({ status: 200 as const, data: { id: request.params.id } }),
    );
    const getResponse = await getApp.request("https://example.test/users/4", {
      headers: { "X-Token": "ok" },
    });
    expect(await getResponse.json()).toEqual({ id: 4 });
  });

  it("nests middleware and mounted child context", async () => {
    const events: string[] = [];
    const child = createRouter<{ requestId: string }>()
      .use<{ child: boolean }>(async (_request, context, next) => {
        events.push("child-before");
        const response = await next({ ...context, child: true });
        events.push("child-after");
        return response;
      })
      .get(
        "/",
        {
          responses: {
            200: z.object({ requestId: z.string(), child: z.boolean() }),
          },
        },
        (_request, context) => {
          events.push("handler");
          return {
            status: 200 as const,
            data: { requestId: context.requestId, child: context.child },
          };
        },
      );
    const app = createRouter()
      .use<{ requestId: string }>(async (_request, context, next) => {
        events.push("parent-before");
        const response = await next({ ...context, requestId: "r1" });
        events.push("parent-after");
        return response;
      })
      .mount("/child", child);

    const response = await app.request("https://example.test/child/");
    expect(await response.json()).toEqual({ requestId: "r1", child: true });
    expect(events).toEqual([
      "parent-before",
      "child-before",
      "handler",
      "child-after",
      "parent-after",
    ]);
  });

  it("formats thrown and framework errors without exposing unknown details", async () => {
    const app = createRouter()
      .errors({
        404: () => ({ title: "Missing" }),
        418: (error) => ({
          title: error instanceof Error ? error.message : "teapot",
        }),
      })
      .get(
        "/tea",
        { responses: { 200: z.object({ ok: z.boolean() }) } },
        () => {
          throw httpError(
            418,
            { reason: "short" },
            { message: "Tea unavailable" },
          );
        },
      );

    const tea = await app.request("https://example.test/tea");
    expect(tea.status).toBe(418);
    expect(await tea.json()).toEqual({ title: "Tea unavailable", status: 418 });
    const missing = await app.request("https://example.test/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ title: "Missing", status: 404 });
  });

  it("handles HEAD, OPTIONS, body limits, and explicit raw responses", async () => {
    const app = createRouter({ bodyLimit: 3 })
      .get(
        "/value",
        { responses: { 200: z.object({ value: z.string() }) } },
        () => ({ status: 200 as const, data: { value: "yes" } }),
      )
      .post(
        "/body",
        {
          request: { body: z.object({ name: z.string() }) },
          responses: { 204: {} },
        },
        () => ({ status: 204 as const }),
      )
      .get(
        "/raw",
        { responses: { 200: z.object({ ignored: z.boolean() }) } },
        () => raw(new Response("raw", { status: 201 })),
      );

    const head = await app.request("https://example.test/value", {
      method: "HEAD",
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const options = await app.request("https://example.test/value", {
      method: "OPTIONS",
    });
    expect(options.headers.get("allow")).toContain("GET");
    const large = await app.request("https://example.test/body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "1234",
    });
    expect(large.status).toBe(413);
    const rawResponse = await app.request("https://example.test/raw");
    expect(rawResponse.status).toBe(201);
    expect(await rawResponse.text()).toBe("raw");
  });
});
