import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter } from "../src/index.ts";

describe("request validation", () => {
  it("rejects invalid request locations before invoking the handler", async () => {
    let calls = 0;
    const app = createRouter().post(
      "/items/{id}",
      {
        request: {
          params: z.object({ id: z.coerce.number().int().positive() }),
          query: z.object({ page: z.coerce.number().int().positive() }),
          headers: z.object({ "x-token": z.string().min(1) }),
          body: z.object({ name: z.string().min(1) }),
        },
        responses: { 204: {} },
      },
      () => {
        calls += 1;
        return { status: 204 as const };
      },
    );
    const request = (url: string, init?: RequestInit) => app.request(url, init);

    expect(
      (
        await request("https://test.invalid/items/nope?page=1", {
          method: "POST",
          headers: { "x-token": "ok", "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("https://test.invalid/items/1?page=nope", {
          method: "POST",
          headers: { "x-token": "ok", "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("https://test.invalid/items/1?page=1", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Ada" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("https://test.invalid/items/1?page=1", {
          method: "POST",
          headers: { "x-token": "ok", "content-type": "application/json" },
          body: JSON.stringify({ name: "" }),
        })
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
  });

  it("accepts JSON media types with parameters and structured suffixes", async () => {
    const app = createRouter().post(
      "/items",
      {
        request: { body: z.object({ name: z.string() }) },
        responses: { 200: z.object({ name: z.string() }) },
      },
      (request) => ({ status: 200 as const, data: request.body }),
    );

    for (const contentType of [
      "application/json; charset=utf-8",
      "application/vnd.api+json",
    ]) {
      const response = await app.request("https://test.invalid/items", {
        method: "POST",
        headers: { "content-type": contentType },
        body: JSON.stringify({ name: "Ada" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ name: "Ada" });
    }
  });

  it("returns controlled errors for malformed JSON, unsupported media types, and oversized bodies", async () => {
    const app = createRouter({ bodyLimit: 3 }).post(
      "/items",
      {
        request: { body: z.object({ name: z.string() }) },
        responses: { 204: {} },
      },
      () => ({ status: 204 as const }),
    );

    const malformed = await app.request("https://test.invalid/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const unsupported = await app.request("https://test.invalid/items", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "body",
    });
    expect(unsupported.status).toBe(415);

    const oversized = await app.request("https://test.invalid/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "1234",
    });
    expect(oversized.status).toBe(413);
  });

  it("does not disclose invalid body values in default validation errors", async () => {
    const app = createRouter().post(
      "/login",
      {
        request: { body: z.object({ password: z.string().min(12) }) },
        responses: { 204: {} },
      },
      () => ({ status: 204 as const }),
    );
    const secret = "short";
    const response = await app.request("https://test.invalid/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: secret }),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(secret);
  });
});
