import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { DefaultRouteMatcher, parsePath, splitPath } from "../src/matchers.ts";

describe("default route matcher", () => {
  it("prefers static segments over parameters and wildcards", () => {
    const matcher = new DefaultRouteMatcher<string>();
    matcher.add("GET", "/users/{id}", "parameter");
    matcher.add("GET", "/users/*rest", "wildcard");
    matcher.add("GET", "/users/me", "static");

    expect(matcher.match("GET", "/users/me")).toEqual({
      route: "static",
      params: {},
    });
    expect(matcher.match("GET", "/users/42")).toEqual({
      route: "parameter",
      params: { id: "42" },
    });
    expect(matcher.match("GET", "/users/42/profile")).toEqual({
      route: "wildcard",
      params: { rest: "42/profile" },
    });
  });

  it("matches methods exactly and permits all-method registrations", () => {
    const matcher = new DefaultRouteMatcher<string>();
    matcher.add("ALL", "/health", "all");
    matcher.add("POST", "/users", "post");

    expect(matcher.match("DELETE", "/health")?.route).toBe("all");
    expect(matcher.match("POST", "/users")?.route).toBe("post");
    expect(matcher.match("GET", "/users")).toBeUndefined();
  });

  it("parses legal route patterns and rejects relative paths", () => {
    expect(parsePath("/files/{name}/*rest")).toEqual([
      { kind: "static", value: "files" },
      { kind: "param", name: "name" },
      { kind: "wildcard", name: "rest" },
    ]);
    expect(splitPath("/")).toEqual([]);
    expect(splitPath("/a/b/")).toEqual(["a", "b"]);
    expect(() => parsePath("users/{id}")).toThrow("must start with '/'");
  });

  it("round-trips generated static paths", () => {
    const segment = fc.stringMatching(/^[a-z]{1,12}$/);
    fc.assert(
      fc.property(
        fc.array(segment, { minLength: 1, maxLength: 5 }),
        (parts) => {
          const path = `/${parts.join("/")}`;
          const matcher = new DefaultRouteMatcher<string>();
          matcher.add("GET", path, path);
          expect(matcher.match("GET", path)).toEqual({
            route: path,
            params: {},
          });
          expect(matcher.match("POST", path)).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("preserves generated parameter values without decoding them", () => {
    const segment = fc.stringMatching(/^[a-zA-Z0-9%]{1,16}$/);
    fc.assert(
      fc.property(segment, (value) => {
        const matcher = new DefaultRouteMatcher<string>();
        matcher.add("GET", "/items/{id}", "item");
        expect(matcher.match("GET", `/items/${value}`)).toEqual({
          route: "item",
          params: { id: value },
        });
      }),
      { numRuns: 100 },
    );
  });
});
