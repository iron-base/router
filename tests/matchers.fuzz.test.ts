import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { DefaultRouteMatcher } from "../src/matchers.ts";

type Route = {
  readonly method: string;
  readonly path: string;
  readonly name: string;
};

function referenceMatch(
  routes: readonly Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const candidates = routes
    .filter((route) => route.method === "ALL" || route.method === method)
    .map((route, registrationIndex) => ({ route, registrationIndex }))
    .filter(({ route }) => {
      const segments = route.path.split("/").filter(Boolean);
      return (
        segments.every((segment, index) => {
          if (segment.startsWith("*")) return true;
          return (
            index < parts.length &&
            (segment.startsWith("{") || segment === parts[index])
          );
        }) &&
        (segments.at(-1)?.startsWith("*") || segments.length === parts.length)
      );
    })
    .sort((left, right) => {
      const leftSegments = left.route.path.split("/").filter(Boolean);
      const rightSegments = right.route.path.split("/").filter(Boolean);
      const length = Math.max(leftSegments.length, rightSegments.length);
      for (let index = 0; index < length; index += 1) {
        const score = (segment: string | undefined) =>
          !segment
            ? 0
            : segment.startsWith("*")
              ? 1
              : segment.startsWith("{")
                ? 2
                : 3;
        const difference =
          score(rightSegments[index]) - score(leftSegments[index]);
        if (difference) return difference;
      }
      return (
        rightSegments.length - leftSegments.length ||
        left.registrationIndex - right.registrationIndex
      );
    });
  const candidate = candidates[0];
  if (!candidate) return undefined;

  const params: Record<string, string> = Object.create(null);
  for (const [index, segment] of candidate.route.path
    .split("/")
    .filter(Boolean)
    .entries()) {
    if (segment.startsWith("{") && segment.endsWith("}")) {
      params[segment.slice(1, -1)] = parts[index]!;
    }
    if (segment.startsWith("*") && segment.length > 1) {
      params[segment.slice(1)] = parts.slice(index).join("/");
      break;
    }
  }
  return { route: candidate.route, params };
}

const segment = fc.stringMatching(/^[a-z]{1,12}$/);

describe("default route matcher properties", () => {
  it("agrees with an independent precedence oracle", () => {
    fc.assert(
      fc.property(segment, segment, segment, (prefix, parameter, literal) => {
        fc.pre(literal !== parameter);
        const routes: Route[] = [
          { method: "GET", path: `/${prefix}/{id}`, name: "parameter" },
          { method: "GET", path: `/${prefix}/*rest`, name: "wildcard" },
          { method: "GET", path: `/${prefix}/${literal}`, name: "static" },
          { method: "POST", path: `/${prefix}/{id}`, name: "post-parameter" },
        ];
        const matcher = new DefaultRouteMatcher<Route>();
        for (const route of routes)
          matcher.add(route.method, route.path, route);

        for (const [method, pathname] of [
          ["GET", `/${prefix}/${literal}`],
          ["GET", `/${prefix}/${parameter}`],
          ["GET", `/${prefix}/${parameter}/profile`],
          ["POST", `/${prefix}/${literal}`],
        ] as const) {
          const actual = matcher.match(method, pathname);
          const expected = referenceMatch(routes, method, pathname);
          expect(actual?.route.name).toBe(expected?.route.name);
          expect(actual?.params).toEqual(expected?.params);
        }
      }),
      { numRuns: 1_000 },
    );
  });

  it("keeps parameter values isolated from prototype property names", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("constructor", "prototype", "__proto__"),
        segment,
        (name, value) => {
          const matcher = new DefaultRouteMatcher<string>();
          matcher.add("GET", `/items/{${name}}`, "item");
          const match = matcher.match("GET", `/items/${value}`);
          expect(match?.route).toBe("item");
          expect(Object.getPrototypeOf(match?.params)).toBeNull();
          expect(match?.params[name]).toBe(value);
        },
      ),
      { numRuns: 250 },
    );
  });

  it("never throws while matching arbitrary pathname-like values", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 128 }), (value) => {
        const matcher = new DefaultRouteMatcher<string>();
        matcher.add("GET", "/items/{id}", "item");
        expect(() => matcher.match("GET", `/${value}`)).not.toThrow();
      }),
      { numRuns: 1_000 },
    );
  });
});
