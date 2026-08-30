import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter, raw } from "../src/index.ts";

describe("response contracts", () => {
  it("rejects undeclared statuses and bodies on bodyless responses", async () => {
    const undeclared = createRouter().get(
      "/",
      { responses: { 200: z.object({ ok: z.boolean() }) } },
      () => ({ status: 201 as never, data: { ok: true } }),
    );
    const bodyless = createRouter().get(
      "/",
      { responses: { 204: {} } },
      () => ({ status: 204 as const, data: { unexpected: true } }) as never,
    );

    expect((await undeclared.request("https://test.invalid/")).status).toBe(
      500,
    );
    expect((await bodyless.request("https://test.invalid/")).status).toBe(500);
  });

  it("enforces declared body and header schemas in always-validation mode", async () => {
    const invalidBody = createRouter({ responseValidation: "always" }).get(
      "/",
      { responses: { 200: z.object({ ok: z.boolean() }) } },
      () => ({ status: 200 as const, data: { ok: "wrong" } as never }),
    );
    const missingHeader = createRouter({ responseValidation: "always" }).get(
      "/",
      {
        responses: {
          200: {
            body: z.object({ ok: z.boolean() }),
            headers: z.object({ "x-request-id": z.string() }),
          },
        },
      },
      () =>
        ({ status: 200 as const, data: { ok: true }, headers: {} }) as never,
    );

    expect((await invalidBody.request("https://test.invalid/")).status).toBe(
      500,
    );
    expect((await missingHeader.request("https://test.invalid/")).status).toBe(
      500,
    );
  });

  it("preserves declared content types and repeated response headers", async () => {
    const app = createRouter().get(
      "/",
      {
        responses: {
          200: {
            body: z.object({ ok: z.boolean() }),
            contentType: "application/vnd.example+json",
          },
        },
      },
      () => ({
        status: 200 as const,
        data: { ok: true },
        headers: { "set-cookie": ["one=1", "two=2"] },
      }),
    );

    const response = await app.request("https://test.invalid/");
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.example+json",
    );
    expect(response.headers.getSetCookie?.()).toEqual(["one=1", "two=2"]);
  });

  it("lets explicit raw responses bypass contract serialization", async () => {
    const app = createRouter({ responseValidation: "always" }).get(
      "/",
      { responses: { 200: z.object({ ok: z.boolean() }) } },
      () => raw(new Response("unvalidated", { status: 202 })),
    );

    const response = await app.request("https://test.invalid/");
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("unvalidated");
  });
});
