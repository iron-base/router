import { createRouter, httpError } from "@ironbase/router";
import { z } from "zod";

const users = new Map([["1", { id: 1, name: "Ada Lovelace" }]]);

const StandardErrorResponse = z.object({
  message: z.string(),
});

export const app = createRouter()
  .errors({
    404: {
      match: (error): error is Error => error instanceof Error,
      schema: StandardErrorResponse,
      handler: (error) => ({
        data: {
          message: error.message,
        },
      }),
    },
  })
  .get(
    "/users/{id}",
    {
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      responses: { 200: z.object({ id: z.number(), name: z.string() }) },
    },
    (request) => {
      const user = users.get(String(request.params.id));
      if (!user) throw httpError(404, { userId: request.params.id });
      return { status: 200 as const, data: user };
    },
  ).compile();

if (import.meta.main) {
  Bun.serve({ fetch: app.fetch });
  // const response = await app.request("https://example.test/users/1");
  // console.log(await response.json());
}
