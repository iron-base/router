import { z } from "zod";
import {
  createRouter,
  defineSecurity,
  type HandlerResult,
  type OpenAPIAdapter,
} from "../src/index.ts";
import {
  type OpenAPI30,
  type OpenAPI31,
  openapi30,
  openapi31,
} from "../src/openapi.ts";

const User = z.object({ id: z.number(), name: z.string() });
const ResponseHeaders = z.object({ "x-request-id": z.string() });
type Responses = {
  200: { body: typeof User; headers: typeof ResponseHeaders };
  204: {};
};

const success: HandlerResult<Responses> = {
  status: 200,
  data: { id: 1, name: "Ada" },
  headers: { "x-request-id": "r1" },
};
const empty: HandlerResult<Responses> = { status: 204 };
void success;
void empty;

const invalidStatus: HandlerResult<Responses> = {
  // @ts-expect-error undeclared statuses are rejected.
  status: 201,
  data: { id: 1, name: "Ada" },
};
// @ts-expect-error bodyless responses cannot carry data.
const invalidEmpty: HandlerResult<Responses> = { status: 204, data: {} };
// @ts-expect-error a response-header contract requires its headers.
const missingHeaders: HandlerResult<Responses> = {
  status: 200,
  data: { id: 1, name: "Ada" },
};
void invalidStatus;
void invalidEmpty;
void missingHeaders;

const child = createRouter<{ database: { query: () => void } }>()
  .use<{ user: { id: string } }>((_request, context, next) =>
    next({ ...context, user: { id: "u1" } }),
  )
  .get("/", { responses: { 204: {} } }, (_request, context) => {
    context.database.query();
    context.user.id;
    return { status: 204 as const };
  });

const parent = createRouter()
  .use<{ database: { query: () => void } }>((_request, context, next) =>
    next({ ...context, database: { query: () => undefined } }),
  )
  .mount("/child", child);
void parent;

// @ts-expect-error child requirements must be provided by the mounting router.
createRouter().mount("/child", child);

const bearer = defineSecurity<{ requestId: string }, { user: string }>({
  name: "bearer",
  scheme: { type: "http", scheme: "bearer" },
  middleware: (_request, context, next) => next({ ...context, user: "u1" }),
});
void bearer;

const openApi30: OpenAPI30.Document = {
  openapi: "3.0.3",
  info: { title: "API", version: "1" },
  paths: {
    "/health": {
      get: { responses: { 200: { description: "Healthy" } } },
    },
  },
};
const openApi31: OpenAPI31.Document = {
  openapi: "3.1.1",
  info: { title: "API", version: "1", summary: "Typed" },
  components: {
    schemas: {
      User: { type: "object", properties: { id: { type: "number" } } },
    },
  },
};
void openApi30;
void openApi31;

const invalid30Info: OpenAPI30.Info = {
  title: "API",
  version: "1",
  // @ts-expect-error `summary` was introduced in OpenAPI 3.1.
  summary: "not supported",
};
const invalidExtension: OpenAPI31.Document = {
  openapi: "3.1.1",
  info: { title: "API", version: "1" },
  // @ts-expect-error document extensions must use the x- prefix.
  custom: true,
};
void invalid30Info;
void invalidExtension;

const adapter30: OpenAPIAdapter<OpenAPI30.Document> = openapi30();
const adapter31: OpenAPIAdapter<OpenAPI31.Document> = openapi31();
void adapter30;
void adapter31;
