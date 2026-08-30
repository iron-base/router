import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { createRouter } from "../src/index.ts";

const segment = fc.stringMatching(/^[a-z]{1,12}$/);

describe("router compilation properties", () => {
  it("compiles and dispatches generated unique static route sets", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(segment, { minLength: 1, maxLength: 20 }),
        async (segments) => {
          let app = createRouter();
          for (const value of segments) {
            app = app.get(`/${value}`, { responses: { 204: {} } }, () => ({
              status: 204 as const,
            }));
          }

          const compiled = app.compile();
          for (const value of segments) {
            const response = await compiled.request(
              `https://test.invalid/${value}`,
            );
            expect(response.status).toBe(204);
          }
        },
      ),
      { numRuns: 250 },
    );
  });

  it("rejects every case-normalized duplicate route", () => {
    fc.assert(
      fc.property(segment, (value) => {
        const app = createRouter({ caseSensitive: false })
          .get(`/${value}`, { responses: { 204: {} } }, () => ({
            status: 204 as const,
          }))
          .get(`/${value.toUpperCase()}`, { responses: { 204: {} } }, () => ({
            status: 204 as const,
          }));
        expect(() => app.compile()).toThrow(`Duplicate route GET /${value}`);
      }),
      { numRuns: 250 },
    );
  });

  it("rejects generated relative paths at registration with a stable diagnostic", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 64 })
          .filter((path) => !path.startsWith("/")),
        (path) => {
          expect(() =>
            createRouter().get(path, { responses: { 204: {} } }, () => ({
              status: 204 as const,
            })),
          ).toThrow(`Route paths must start with '/': ${path}`);
        },
      ),
      { numRuns: 250 },
    );
  });
});
