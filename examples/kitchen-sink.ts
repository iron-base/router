import { createRouter, defineSecurity, httpError, raw } from "@ironbase/router";
import { openapi30, openapi31 } from "@ironbase/router/openapi";
import { z } from "zod";

type Runtime = { region: string };
type RequestContext = { requestId: string; region: string };
type AuthContext = { subject: string; tenantId: string };

const Task = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  completed: z.boolean(),
});
const TaskInput = Task.omit({ id: true, completed: true });
const tasks = new Map<string, z.infer<typeof Task>>();

const bearer = defineSecurity<RequestContext, AuthContext>({
  name: "bearerAuth",
  scheme: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  middleware: (request, context, next) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) throw httpError(401, { reason: "Missing bearer token" });
    const [tenantId, subject] = token.split(":");
    if (!tenantId || !subject)
      throw httpError(401, { reason: "Malformed token" });
    return next({ ...context, tenantId, subject });
  },
});

const tasksApi = createRouter<RequestContext & AuthContext>()
  .use((request, context, next) => {
    if (request.headers.get("x-maintenance-mode") === "true") {
      return new Response("Maintenance", { status: 503 });
    }
    return next(context);
  })
  .get(
    "/tasks",
    {
      operationId: "listTasks",
      summary: "List tasks",
      tags: ["tasks"],
      request: {
        query: z.object({ completed: z.coerce.boolean().optional() }),
        headers: z.object({ "x-client-version": z.string().optional() }),
      },
      responses: {
        200: {
          body: z.object({ tasks: z.array(Task), requestId: z.string() }),
          headers: z.object({ "x-request-id": z.string() }),
          description: "The tenant's tasks",
        },
      },
    },
    (request, context) => ({
      status: 200 as const,
      data: {
        tasks: [...tasks.values()].filter(
          (task) =>
            request.query.completed === undefined ||
            task.completed === request.query.completed,
        ),
        requestId: context.requestId,
      },
      headers: { "x-request-id": context.requestId },
    }),
  )
  .post(
    "/tasks",
    {
      operationId: "createTask",
      summary: "Create a task",
      tags: ["tasks"],
      request: { body: TaskInput },
      responses: { 201: { body: Task, description: "The created task" } },
      errors: [409],
    },
    (request) => {
      if (
        [...tasks.values()].some((task) => task.title === request.body.title)
      ) {
        throw httpError(409, { title: request.body.title });
      }
      const task = {
        id: crypto.randomUUID(),
        title: request.body.title,
        completed: false,
      };
      tasks.set(task.id, task);
      return { status: 201 as const, data: task };
    },
  )
  .put(
    "/tasks/{id}",
    {
      summary: "Replace a task",
      tags: ["tasks"],
      request: { params: z.object({ id: z.string().uuid() }), body: TaskInput },
      responses: { 200: Task },
    },
    (request) => {
      if (!tasks.has(request.params.id))
        throw httpError(404, { id: request.params.id });
      const task = {
        id: request.params.id,
        title: request.body.title,
        completed: false,
      };
      tasks.set(task.id, task);
      return { status: 200 as const, data: task };
    },
  )
  .patch(
    "/tasks/{id}",
    {
      summary: "Update a task",
      tags: ["tasks"],
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: Task.partial().omit({ id: true }),
      },
      responses: { 200: Task },
    },
    (request) => {
      const current = tasks.get(request.params.id);
      if (!current) throw httpError(404, { id: request.params.id });
      const task = { ...current, ...request.body };
      tasks.set(task.id, task);
      return { status: 200 as const, data: task };
    },
  )
  .delete(
    "/tasks/{id}",
    {
      summary: "Delete a task",
      tags: ["tasks"],
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: { 204: { description: "The task was deleted" } },
    },
    (request) => {
      if (!tasks.delete(request.params.id))
        throw httpError(404, { id: request.params.id });
      return { status: 204 as const };
    },
  )
  .head(
    "/tasks/{id}",
    {
      summary: "Check whether a task exists",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: { 204: { description: "The task exists" } },
    },
    (request) => {
      if (!tasks.has(request.params.id))
        throw httpError(404, { id: request.params.id });
      return { status: 204 as const };
    },
  )
  .options(
    "/tasks",
    { summary: "Describe task collection methods", responses: { 204: {} } },
    () => ({ status: 204 as const }),
  );

export const app = createRouter<RequestContext>({
  context: (_request, runtime) => ({
    requestId: crypto.randomUUID(),
    region: (runtime as Runtime | undefined)?.region ?? "local",
  }),
  trailingSlash: "ignore",
  caseSensitive: false,
  responseValidation: "always",
  problemDetails: { typeBaseUrl: "https://api.example.test/problems" },
  openapi: {
    info: {
      title: "Kitchen Sink API",
      version: "1.0.0",
      description: "Router feature coverage.",
    },
  },
})
  .errors({
    401: () => ({ title: "Unauthorized" }),
    404: (error) => ({
      title: "Not found",
      detail: error instanceof Error ? error.message : undefined,
    }),
    409: {
      schema: z.object({ code: z.literal("TASK_CONFLICT"), title: z.string() }),
      handler: (error) => ({
        data: {
          code: "TASK_CONFLICT" as const,
          title:
            error instanceof Error
              ? error.message
              : "A task already has that title",
        },
      }),
    },
  })
  .use<RequestContext>((request, context, next) =>
    next({
      ...context,
      requestId: request.headers.get("x-request-id") ?? context.requestId,
    }),
  )
  .get(
    "/health",
    {
      security: [],
      responses: { 200: z.object({ ok: z.literal(true), region: z.string() }) },
    },
    (_request, context) => ({
      status: 200 as const,
      data: { ok: true as const, region: context.region },
    }),
  )
  .get(
    "/download",
    {
      security: [],
      responses: {
        200: { contentType: "text/plain", description: "A raw text response" },
      },
    },
    () =>
      raw(
        new Response("download", { headers: { "content-type": "text/plain" } }),
      ),
  )
  .use(bearer.required())
  .mount("/v1", tasksApi)
  .all(
    "/debug/*path",
    {
      summary: "Inspect fallback routing",
      responses: { 200: z.object({ method: z.string() }) },
    },
    (request) => ({
      status: 200 as const,
      data: { method: request.raw.method },
    }),
  );

if (import.meta.main) {
  const response = await app.request(
    "https://example.test/v1/tasks",
    {
      method: "POST",
      headers: {
        authorization: "Bearer demo:ada",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "Exercise every feature" }),
    },
    { region: "us-east-1" },
  );
  console.log(response.status, await response.json());
  console.log(
    JSON.stringify(
      await app.openapi({ adapter: openapi31(), validate: true }),
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(await app.openapi({ adapter: openapi30() }), null, 2),
  );
}
