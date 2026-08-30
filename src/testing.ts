import type { CompiledRouter, Router } from "./router.ts";

/** Dispatches through the same compiled Fetch boundary used in production. */
export function request(
  router: Router | CompiledRouter,
  input: string | Request,
  init?: RequestInit,
  runtime?: unknown,
): Promise<Response> {
  return router.request(input, init, runtime);
}
