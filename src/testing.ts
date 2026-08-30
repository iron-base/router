import type { CompiledRouter, Router } from "./router.ts";

/**
 * Dispatches through the same compiled Fetch boundary used in production.
 *
 * @param router - A router or already compiled router to dispatch through.
 * @param input - An absolute URL or native request.
 * @param init - Request options when `input` is a URL.
 * @param runtime - The runtime value passed to the router context factory.
 * @example
 * ```ts
 * const response = await request(app, "https://api.example.test/health");
 * ```
 * @returns The route response.
 */
export function request(
  router: Router | CompiledRouter,
  input: string | Request,
  init?: RequestInit,
  runtime?: unknown,
): Promise<Response> {
  return router.request(input, init, runtime);
}
