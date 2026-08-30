export interface RouteMatcher<Route> {
  add(method: string, path: string, route: Route): void;
  match(
    method: string,
    pathname: string,
  ): { route: Route; params: Record<string, string> } | undefined;
}

interface Entry<Route> {
  readonly method: string;
  readonly path: string;
  readonly route: Route;
  readonly segments: readonly Segment[];
  readonly score: readonly number[];
}

type Segment =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "wildcard"; readonly name: string };

/**
 * The built-in matcher deliberately has no knowledge of route contracts or
 * dispatch. Its ordering is static segment, parameter, then wildcard.
 */
export class DefaultRouteMatcher<Route> implements RouteMatcher<Route> {
  #entries: Entry<Route>[] = [];

  add(method: string, path: string, route: Route): void {
    const segments = parsePath(path);
    this.#entries.push({
      method: method.toUpperCase(),
      path,
      route,
      segments,
      score: segments.map((segment) =>
        segment.kind === "static" ? 3 : segment.kind === "param" ? 2 : 1,
      ),
    });
    this.#entries.sort(compareEntries);
  }

  match(
    method: string,
    pathname: string,
  ): { route: Route; params: Record<string, string> } | undefined {
    const parts = splitPath(pathname);
    for (const entry of this.#entries) {
      if (entry.method !== "ALL" && entry.method !== method.toUpperCase()) {
        continue;
      }
      const params: Record<string, string> = Object.create(null);
      if (matches(entry.segments, parts, params)) {
        return { route: entry.route, params };
      }
    }
    return undefined;
  }
}

export function parsePath(path: string): readonly Segment[] {
  if (!path.startsWith("/")) {
    throw new TypeError(`Route paths must start with '/': ${path}`);
  }
  return splitPath(path).map((segment) => {
    const parameter = /^\{([^{}]+)\}$/.exec(segment);
    if (parameter?.[1]) return { kind: "param", name: parameter[1] };
    const wildcard = /^\*([A-Za-z0-9_]+)?$/.exec(segment);
    if (wildcard) return { kind: "wildcard", name: wildcard[1] || "*" };
    return { kind: "static", value: segment };
  });
}

export function splitPath(path: string): readonly string[] {
  return path === "/" ? [] : path.replace(/^\/+|\/+$/g, "").split("/");
}

function compareEntries<Route>(
  left: Entry<Route>,
  right: Entry<Route>,
): number {
  const length = Math.max(left.score.length, right.score.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right.score[index] ?? 0) - (left.score[index] ?? 0);
    if (difference) return difference;
  }
  return right.score.length - left.score.length;
}

function matches(
  pattern: readonly Segment[],
  path: readonly string[],
  params: Record<string, string>,
): boolean {
  let pathIndex = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index];
    if (!segment) return false;
    if (segment.kind === "wildcard") {
      const value = path.slice(pathIndex).join("/");
      if (segment.name !== "*") params[segment.name] = value;
      return true;
    }
    const value = path[pathIndex++];
    if (value === undefined) return false;
    if (segment.kind === "static" && segment.value !== value) return false;
    if (segment.kind === "param") params[segment.name] = value;
  }
  return pathIndex === path.length;
}
