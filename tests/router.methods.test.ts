import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter } from "../src/index.ts";

describe("HTTP method dispatch", () => {
  it("constructs complete deterministic Allow headers and automatic OPTIONS", async () => {
    const app = createRouter()
      .get(
        "/items/{id}",
        {
          request: { params: z.object({ id: z.string() }) },
          responses: { 204: {} },
        },
        () => ({ status: 204 as const }),
      )
      .post(
        "/items/{id}",
        {
          request: { params: z.object({ id: z.string() }) },
          responses: { 204: {} },
        },
        () => ({ status: 204 as const }),
      );

    const mismatch = await app.request("https://test.invalid/items/42", {
      method: "PATCH",
    });
    expect(mismatch.status).toBe(405);
    expect(mismatch.headers.get("allow")).toBe("GET, HEAD, POST");

    const options = await app.request("https://test.invalid/items/42", {
      method: "OPTIONS",
    });
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, POST");
  });

  it("lets explicit HEAD and OPTIONS handlers override automatic behavior", async () => {
    const app = createRouter()
      .get(
        "/resource",
        { responses: { 200: z.object({ source: z.string() }) } },
        () => ({ status: 200 as const, data: { source: "get" } }),
      )
      .head("/resource", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }))
      .options(
        "/resource",
        { responses: { 200: z.object({ source: z.string() }) } },
        () => ({ status: 200 as const, data: { source: "options" } }),
      );

    const head = await app.request("https://test.invalid/resource", {
      method: "HEAD",
    });
    expect(head.status).toBe(204);
    expect(await head.text()).toBe("");

    const options = await app.request("https://test.invalid/resource", {
      method: "OPTIONS",
    });
    expect(options.status).toBe(200);
    expect(await options.json()).toEqual({ source: "options" });
  });

  it("can disable automatic OPTIONS while retaining a 405 Allow header", async () => {
    const app = createRouter({ autoOptions: false }).get(
      "/resource",
      { responses: { 204: {} } },
      () => ({ status: 204 as const }),
    );

    const options = await app.request("https://test.invalid/resource", {
      method: "OPTIONS",
    });
    expect(options.status).toBe(405);
    expect(options.headers.get("allow")).toBe("GET, HEAD");
  });

  it("keeps unknown paths distinct from method mismatches", async () => {
    const app = createRouter().get(
      "/known",
      { responses: { 204: {} } },
      () => ({ status: 204 as const }),
    );

    const response = await app.request("https://test.invalid/unknown", {
      method: "POST",
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("allow")).toBeNull();
  });
});
