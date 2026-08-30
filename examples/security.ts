import { createRouter, defineSecurity, httpError } from "@ironbase/router";
import { z } from "zod";

const bearer = defineSecurity<{}, { subject: string }>({
  name: "bearerAuth",
  scheme: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  middleware: (request, context, next) => {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw httpError(401, {});
    return next({ ...context, subject: authorization.slice("Bearer ".length) });
  },
});

export const app = createRouter()
  .errors({ 401: () => ({ title: "Unauthorized" }) })
  .use(bearer.required())
  .get(
    "/private",
    { responses: { 200: z.object({ subject: z.string() }) } },
    (_request, context) => ({
      status: 200 as const,
      data: { subject: context.subject },
    }),
  );

if (import.meta.main) {
  console.log(
    await (
      await app.request("https://example.test/private", {
        headers: { authorization: "Bearer demo-user" },
      })
    ).json(),
  );
}
