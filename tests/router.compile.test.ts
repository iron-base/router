import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createRouter } from "../src/index.ts";
import type { RouteMatcher } from "../src/matchers.ts";
import type { CompiledRoute } from "../src/router.ts";

describe("router compilation", () => {
  it("compiles lazily once after a successful dispatch", async () => {
    let created = 0;
    const matcher = (): RouteMatcher<CompiledRoute> => {
      created += 1;
      const routes: CompiledRoute[] = [];
      return {
        add: (_method, _path, route) => routes.push(route),
        match: (_method, _pathname) =>
          routes[0] ? { route: routes[0], params: {} } : undefined,
      };
    };
    const app = createRouter({ matcher }).get(
      "/",
      { responses: { 204: {} } },
      () => ({ status: 204 as const }),
    );

    expect(created).toBe(0);
    expect((await app.request("https://test.invalid/")).status).toBe(204);
    expect((await app.request("https://test.invalid/")).status).toBe(204);
    expect(created).toBe(1);
  });

  it("does not cache a failed compilation", () => {
    let created = 0;
    const app = createRouter({
      matcher: () => {
        created += 1;
        return { add: () => {}, match: () => undefined };
      },
    }).get("/items/{id}", { responses: { 204: {} } }, () => ({
      status: 204 as const,
    }));

    expect(() => app.compile()).toThrow(
      "has path parameters but no params schema",
    );
    expect(() => app.compile()).toThrow(
      "has path parameters but no params schema",
    );
    expect(created).toBe(2);
  });

  it("rejects duplicates after routing normalization and duplicate operation IDs", () => {
    const duplicatePath = createRouter({
      caseSensitive: false,
      trailingSlash: "ignore",
    })
      .get("/Users", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }))
      .get("/users/", { responses: { 204: {} } }, () => ({
        status: 204 as const,
      }));
    const duplicateOperation = createRouter()
      .get(
        "/one",
        { operationId: "duplicate", responses: { 204: {} } },
        () => ({ status: 204 as const }),
      )
      .get(
        "/two",
        { operationId: "duplicate", responses: { 204: {} } },
        () => ({ status: 204 as const }),
      );

    expect(() => duplicatePath.compile()).toThrow("Duplicate route GET /users");
    expect(() => duplicateOperation.compile()).toThrow(
      "Duplicate operationId 'duplicate'",
    );
  });

  it("captures route definitions at registration instead of retaining mutable caller objects", async () => {
    const options = {
      responses: { 200: z.object({ ok: z.boolean() }) },
    };
    const app = createRouter().get("/", options, () => ({
      status: 200 as const,
      data: { ok: true },
    }));

    options.responses = { 201: z.object({ changed: z.boolean() }) } as never;
    const response = await app.request("https://test.invalid/");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
