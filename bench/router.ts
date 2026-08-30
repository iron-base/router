import { bench, do_not_optimize, run } from "mitata";
import { z } from "zod";
import { createRouter } from "../src/index.ts";

const origin = "https://benchmark.invalid";
const payload = JSON.stringify({ name: "Ada Lovelace", active: true });

const staticRouter = createRouter({ responseValidation: "off" })
  .get(
    "/health",
    { responses: { 200: z.object({ ok: z.boolean() }) } },
    () => ({ status: 200 as const, data: { ok: true } }),
  )
  .compile();

const validatedRouter = createRouter({ responseValidation: "always" })
  .post(
    "/users/{id}",
    {
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ source: z.string() }),
        headers: z.object({ "x-request-id": z.string() }),
        body: z.object({ name: z.string(), active: z.boolean() }),
      },
      responses: {
        200: z.object({
          id: z.number(),
          name: z.string(),
          active: z.boolean(),
        }),
      },
    },
    (request) => ({
      status: 200 as const,
      data: {
        id: request.params.id,
        name: request.body.name,
        active: request.body.active,
      },
    }),
  )
  .compile();

let manyRoutes = createRouter({ responseValidation: "off" });
for (let index = 0; index < 250; index += 1) {
  manyRoutes = manyRoutes.get(
    `/resources/${index}`,
    { responses: { 204: {} } },
    () => ({ status: 204 as const }),
  );
}
const manyRoutesRouter = manyRoutes.compile();

async function requestResponse(
  router: { fetch(request: Request): Promise<Response> },
  request: Request,
): Promise<ArrayBuffer> {
  const response = await router.fetch(request);
  if (!response.ok)
    throw new Error(`Expected successful response, got ${response.status}`);
  return response.arrayBuffer();
}

bench("compiled.fetch: static GET request -> consumed response", async () => {
  do_not_optimize(
    await requestResponse(staticRouter, new Request(`${origin}/health`)),
  );
});

bench(
  "compiled.fetch: validated POST request -> consumed response",
  async () => {
    do_not_optimize(
      await requestResponse(
        validatedRouter,
        new Request(`${origin}/users/42?source=benchmark`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "benchmark-request",
          },
          body: payload,
        }),
      ),
    );
  },
);

bench(
  "compiled.fetch: 250-route GET request -> consumed response",
  async () => {
    do_not_optimize(
      await requestResponse(
        manyRoutesRouter,
        new Request(`${origin}/resources/249`),
      ),
    );
  },
);

await run();
