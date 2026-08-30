import { createRouter, httpError } from "@ironbase/router";
import { z } from "zod";

const users = new Map([["1", { id: 1, name: "Ada Lovelace" }]]);

export const app = createRouter()
  .errors({
    404: (error) => ({
      title: "User not found",
      detail: error instanceof Error ? error.message : undefined,
    }),
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
  );

if (import.meta.main) {
  const response = await app.request("https://example.test/users/1");
  console.log(await response.json());
}
