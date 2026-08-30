import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { z } from "zod";
import { createRouter } from "../src/index.ts";

const encodedSegment = fc
  .constantFrom(
    "plain",
    "hello world",
    `caf${String.fromCodePoint(0x00e9)}`,
    String.fromCodePoint(0x1f600),
    "a/b",
  )
  .map(encodeURIComponent);

describe("router dispatch properties", () => {
  it("decodes valid path parameters exactly once regardless of the query string", async () => {
    await fc.assert(
      fc.asyncProperty(
        encodedSegment,
        fc.array(
          fc.tuple(
            fc.stringMatching(/^[a-z]{1,8}$/),
            fc.string({ maxLength: 16 }),
          ),
          { maxLength: 5 },
        ),
        async (encodedId, pairs) => {
          const app = createRouter().get(
            "/items/{id}",
            {
              request: { params: z.object({ id: z.string() }) },
              responses: { 200: z.object({ id: z.string() }) },
            },
            (request) => ({
              status: 200 as const,
              data: { id: request.params.id },
            }),
          );
          const query = new URLSearchParams(pairs).toString();
          const response = await app.request(
            `https://test.invalid/items/${encodedId}${query ? `?${query}` : ""}`,
          );

          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({
            id: decodeURIComponent(encodedId),
          });
        },
      ),
      { numRuns: 250 },
    );
  });

  it("turns malformed percent encodings into controlled client errors", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("%", "%ZZ", "%E0%A4%A", "%C3%28"),
        async (encodedId) => {
          const app = createRouter().get(
            "/items/{id}",
            {
              request: { params: z.object({ id: z.string() }) },
              responses: { 204: {} },
            },
            () => ({ status: 204 as const }),
          );
          const response = await app.request(
            `https://test.invalid/items/${encodedId}`,
          );
          expect(response.status).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not leak a method mismatch as an uncaught exception", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("POST", "PUT", "PATCH", "DELETE"),
        fc.string({ maxLength: 64 }),
        async (method, suffix) => {
          const app = createRouter().get(
            "/known",
            { responses: { 204: {} } },
            () => ({ status: 204 as const }),
          );
          const response = await app.request(
            `https://test.invalid/known?input=${encodeURIComponent(suffix)}`,
            { method },
          );
          expect(response.status).toBe(405);
          expect(response.headers.get("allow")).toBe("GET, HEAD");
        },
      ),
      { numRuns: 250 },
    );
  });
});
