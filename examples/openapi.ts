import {
  createRouter,
  type StandardJSONSchemaV1,
  type StandardSchemaV1,
} from "@ironbase/router";
import { openapi30, openapi31 } from "@ironbase/router/openapi";

const User: StandardSchemaV1<
  { id: string; name: string },
  { id: number; name: string }
> &
  StandardJSONSchemaV1<
    { id: string; name: string },
    { id: number; name: string }
  > = {
  "~standard": {
    version: 1 as const,
    vendor: "example",
    validate: (value: unknown) => ({
      value: value as { id: number; name: string },
    }),
    jsonSchema: {
      input: (_options: StandardJSONSchemaV1.Options) => ({
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" } },
        required: ["id", "name"],
      }),
      output: (_options: StandardJSONSchemaV1.Options) => ({
        type: "object",
        properties: { id: { type: "number" }, name: { type: "string" } },
        required: ["id", "name"],
      }),
    },
  },
};

export const app = createRouter({
  openapi: { info: { title: "Example API", version: "1.0.0" } },
}).get(
  "/users/{id}",
  { request: { params: User }, responses: { 200: User } },
  (request) => ({
    status: 200 as const,
    data: { id: Number(request.params.id), name: "Ada" },
  }),
);

if (import.meta.main) {
  console.log(
    JSON.stringify(await app.openapi({ adapter: openapi31() }), null, 2),
  );
  console.log(
    JSON.stringify(await app.openapi({ adapter: openapi30() }), null, 2),
  );
}
