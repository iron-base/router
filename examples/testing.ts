import { createRouter } from "@ironbase/router";
import { request } from "@ironbase/router/testing";
import { z } from "zod";

export const app = createRouter().get(
  "/health",
  { responses: { 200: z.object({ ok: z.boolean() }) } },
  () => ({ status: 200 as const, data: { ok: true } }),
);

export async function checkHealth(): Promise<boolean> {
  const response = await request(app, "https://example.test/health");
  return (
    response.status === 200 && ((await response.json()) as { ok: boolean }).ok
  );
}

if (import.meta.main) {
  console.log(await checkHealth());
}
