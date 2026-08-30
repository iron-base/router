import { createRouter, httpError } from "@ironbase/router";
import { z } from "zod";

export const app = createRouter({
  problemDetails: { typeBaseUrl: "https://api.example.test/problems" },
})
  .errors({
    400: (error) => ({
      title: "Invalid request",
      detail: error instanceof Error ? error.message : undefined,
    }),
    409: {
      schema: z.object({ code: z.literal("CONFLICT"), resource: z.string() }),
      handler: (error) => ({
        data: {
          code: "CONFLICT" as const,
          resource: error instanceof Error ? error.message : "unknown",
        },
      }),
    },
  })
  .post(
    "/users",
    {
      request: { body: z.object({ email: z.string().email() }) },
      responses: { 201: z.object({ email: z.string().email() }) },
    },
    (request) => {
      if (request.body.email === "ada@example.test") {
        throw httpError(409, {}, { message: request.body.email });
      }
      return { status: 201 as const, data: request.body };
    },
  );

if (import.meta.main) {
  const response = await app.request("https://example.test/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "ada@example.test" }),
  });
  console.log(response.status, await response.json());
}
