import { createRouter } from "@ironbase/router";
import { z } from "zod";

type ParentContext = { requestId: string };

// The generic argument declares capabilities this reusable child expects.
const users = createRouter<ParentContext>()
  .use<{ user: { id: string } }>((_request, context, next) =>
    next({ ...context, user: { id: "demo-user" } }),
  )
  .get(
    "/me",
    {
      responses: {
        200: z.object({ userId: z.string(), requestId: z.string() }),
      },
    },
    (_request, context) => ({
      status: 200 as const,
      data: { userId: context.user.id, requestId: context.requestId },
    }),
  );

export const app = createRouter()
  .use<ParentContext>((_request, context, next) =>
    next({ ...context, requestId: crypto.randomUUID() }),
  )
  .mount("/users", users)
  .compile();

if (import.meta.main) {
  Bun.serve({ fetch: app.fetch });
  // console.log(
  //   await (await app.request("https://example.test/users/me")).json(),
  // );
}
