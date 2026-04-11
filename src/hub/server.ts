import http from "node:http";
import { URL } from "node:url";
import { badRequest, notFound, readJsonBody, sendHtml, sendJson, unauthorized } from "../shared/http";
import {
  deviceRegistrationSchema,
  observationSchema,
  taskDecisionSchema,
  taskRequestInputSchema,
  taskResultInputSchema
} from "../shared/types";
import { renderDashboard } from "./html";
import { MissionControlStore } from "./store";

type HubServerOptions = {
  port: number;
  store: MissionControlStore;
  sharedToken?: string;
};

function assertAuthorized(token: string | undefined, authHeader: string | undefined): boolean {
  if (!token) {
    return true;
  }

  return authHeader === `Bearer ${token}`;
}

export function createHubServer(options: HubServerOptions) {
  const server = http.createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (method === "GET" && url.pathname === "/") {
        return sendHtml(response, renderDashboard(options.store.getState(), options.store.getLatestPlan()));
      }

      if (method === "GET" && url.pathname === "/api/state") {
        return sendJson(response, 200, {
          state: options.store.getState(),
          latestPlan: options.store.getLatestPlan()
        });
      }

      if (method === "GET" && url.pathname === "/api/devices") {
        return sendJson(response, 200, Object.values(options.store.getState().devices));
      }

      if (method === "GET" && url.pathname === "/api/approvals") {
        return sendJson(response, 200, options.store.getPendingApprovals());
      }

      if (method === "GET" && url.pathname === "/api/desktop-control/evaluation") {
        return sendJson(response, 200, options.store.getState().desktopControlEvaluation);
      }

      if (method === "GET" && url.pathname === "/api/task-requests") {
        const deviceId = url.searchParams.get("deviceId");
        if (!deviceId) {
          throw new Error("deviceId query parameter is required.");
        }
        return sendJson(response, 200, options.store.getApprovedTasks(deviceId));
      }

      if (!assertAuthorized(options.sharedToken, request.headers.authorization)) {
        return unauthorized(response);
      }

      if (method === "POST" && url.pathname === "/api/devices/register") {
        const input = deviceRegistrationSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.registerDevice(input));
      }

      if (method === "POST" && url.pathname === "/api/observations") {
        const input = observationSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.addObservation(input));
      }

      if (method === "POST" && url.pathname === "/api/task-requests") {
        const input = taskRequestInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.requestTask(input));
      }

      if (method === "POST" && /^\/api\/task-requests\/[^/]+\/decision$/.test(url.pathname)) {
        const taskRequestId = url.pathname.split("/")[3];
        if (!taskRequestId) {
          throw new Error("Task request id is required.");
        }
        const input = taskDecisionSchema.parse(await readJsonBody(request));
        return sendJson(response, 200, options.store.decideTask(taskRequestId, input));
      }

      if (method === "POST" && /^\/api\/task-requests\/[^/]+\/result$/.test(url.pathname)) {
        const taskRequestId = url.pathname.split("/")[3];
        if (!taskRequestId) {
          throw new Error("Task request id is required.");
        }
        const input = taskResultInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 200, options.store.updateTaskResult(taskRequestId, input));
      }

      return notFound(response);
    } catch (error) {
      return badRequest(response, error);
    }
  });

  return {
    server,
    listen(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(options.port, resolve);
      });
    }
  };
}
