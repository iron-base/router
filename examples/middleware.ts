import { createRouter, type Middleware } from "@ironbase/router";
import { z } from "zod";

type RequestContext = { requestId: string };

const requestId: Middleware<{}, RequestContext> = (_request, context, next) =>
  next({ ...context, requestId: crypto.randomUUID() });

export const app = createRouter()
  .use<RequestContext>(requestId)
  .get(
    "/health",
    {
      responses: { 200: z.object({ ok: z.boolean(), requestId: z.string() }) },
    },
    (_request, context) => ({
      status: 200 as const,
      data: { ok: true, requestId: context.requestId },
    }),
  );

if (import.meta.main) {
  console.log(await (await app.request("https://example.test/health")).json());
}
