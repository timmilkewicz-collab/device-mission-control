import http from "node:http";
import { URL } from "node:url";
import { badRequest, notFound, readFormBody, readJsonBody, redirect, sendHtml, sendJson, unauthorized } from "../shared/http";
import {
  councilResponseInputSchema,
  councilSessionInputSchema,
  deviceRegistrationSchema,
  linkUpsertSchema,
  nodeUpsertSchema,
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

function buildDiscoveryManifest(options: HubServerOptions, requestUrl: URL) {
  const origin = requestUrl.origin;
  return {
    name: "device-mission-control",
    description: "Observer-first coordination hub for machines, links, devices, agents, and council sessions.",
    auth: options.sharedToken
      ? {
          mode: "bearer",
          note: "Write operations require Authorization: Bearer <MISSION_CONTROL_TOKEN>."
        }
      : {
          mode: "open-local",
          note: "Browser actions and JSON writes are enabled because MISSION_CONTROL_TOKEN is not configured."
        },
    discovery: {
      self: `${origin}/.well-known/mission-control.json`,
      dashboard: `${origin}/`,
      state: `${origin}/api/state`
    },
    endpoints: {
      nodes: {
        list: `${origin}/api/nodes`,
        upsert: `${origin}/api/nodes`
      },
      links: {
        list: `${origin}/api/links`,
        upsert: `${origin}/api/links`
      },
      devices: {
        list: `${origin}/api/devices`,
        register: `${origin}/api/devices/register`
      },
      observations: {
        submit: `${origin}/api/observations`
      },
      tasks: {
        approvedForDevice: `${origin}/api/task-requests?deviceId=<deviceId>`,
        request: `${origin}/api/task-requests`,
        decide: `${origin}/api/task-requests/<taskRequestId>/decision`,
        result: `${origin}/api/task-requests/<taskRequestId>/result`,
        approvals: `${origin}/api/approvals`
      },
      council: {
        list: `${origin}/api/council/sessions`,
        create: `${origin}/api/council/sessions`,
        respond: `${origin}/api/council/sessions/<sessionId>/responses`,
        close: `${origin}/api/council/sessions/<sessionId>/close`
      },
      evaluation: {
        desktopControl: `${origin}/api/desktop-control/evaluation`
      }
    },
    suggestedBootOrder: [
      "GET /.well-known/mission-control.json",
      "GET /api/state",
      "GET /api/nodes",
      "GET /api/links"
    ]
  };
}

export function createHubServer(options: HubServerOptions) {
  const server = http.createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (method === "GET" && url.pathname === "/") {
        return sendHtml(
          response,
          renderDashboard(options.store.getState(), options.store.getLatestPlan(), {
            interactive: !options.sharedToken
          })
        );
      }

      if (method === "GET" && url.pathname === "/.well-known/mission-control.json") {
        return sendJson(response, 200, buildDiscoveryManifest(options, url));
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

      if (method === "GET" && url.pathname === "/api/nodes") {
        return sendJson(response, 200, options.store.getNodes());
      }

      if (method === "GET" && url.pathname === "/api/links") {
        return sendJson(response, 200, options.store.getLinks());
      }

      if (method === "GET" && url.pathname === "/api/approvals") {
        return sendJson(response, 200, options.store.getPendingApprovals());
      }

      if (method === "GET" && url.pathname === "/api/desktop-control/evaluation") {
        return sendJson(response, 200, options.store.getState().desktopControlEvaluation);
      }

      if (method === "GET" && url.pathname === "/api/council/sessions") {
        return sendJson(response, 200, options.store.getCouncilSessions());
      }

      if (method === "GET" && url.pathname === "/api/task-requests") {
        const deviceId = url.searchParams.get("deviceId");
        if (!deviceId) {
          throw new Error("deviceId query parameter is required.");
        }
        return sendJson(response, 200, options.store.getApprovedTasks(deviceId));
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/task-requests") {
        const form = await readFormBody(request);
        const input = taskRequestInputSchema.parse({
          deviceId: form.deviceId,
          taskId: form.taskId,
          requestedBy: form.requestedBy || "dashboard"
        });
        options.store.requestTask(input);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && /^\/actions\/task-requests\/[^/]+\/decision$/.test(url.pathname)) {
        const taskRequestId = url.pathname.split("/")[3];
        if (!taskRequestId) {
          throw new Error("Task request id is required.");
        }

        const form = await readFormBody(request);
        const input = taskDecisionSchema.parse({
          approved: form.approved === "true",
          actor: form.actor || "dashboard",
          reason: form.approved === "true" ? undefined : "Rejected from dashboard"
        });
        options.store.decideTask(taskRequestId, input);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/council/sessions") {
        const form = await readFormBody(request);
        const targetMemberIds = (form.targetMemberIds ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const input = councilSessionInputSchema.parse({
          topic: form.topic,
          prompt: form.prompt,
          requestedBy: form.requestedBy || "dashboard",
          targetMemberIds
        });
        options.store.createCouncilSession(input);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && /^\/actions\/council\/sessions\/[^/]+\/close$/.test(url.pathname)) {
        const councilSessionId = url.pathname.split("/")[4];
        if (!councilSessionId) {
          throw new Error("Council session id is required.");
        }
        options.store.closeCouncilSession(councilSessionId);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/nodes") {
        const form = await readFormBody(request);
        const tags = (form.tags ?? "").split(",").map((value) => value.trim()).filter(Boolean);
        const notes = (form.notes ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
        const linkedNodeIds = (form.linkedNodeIds ?? "").split(",").map((value) => value.trim()).filter(Boolean);
        const agentSurfaces = (form.agentSurfaces ?? "").split(",").map((value) => value.trim()).filter(Boolean);
        const capabilities = (form.capabilities ?? "").split(",").map((value) => value.trim()).filter(Boolean);
        const reachabilityNotes = (form.reachabilityNotes ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
        const input = nodeUpsertSchema.parse({
          nodeId: form.nodeId,
          label: form.label,
          kind: form.kind,
          platform: form.platform,
          status: form.status,
          linkedDeviceId: form.linkedDeviceId || undefined,
          linkedNodeIds,
          agentSurfaces,
          capabilities,
          tags,
          notes,
          reachability: {
            tailscale: form.tailscale === "true",
            ssh: form.ssh === "true",
            localAgent: form.localAgent === "true",
            companion: form.companion === "true",
            notes: reachabilityNotes
          }
        });
        options.store.upsertNode(input);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/links") {
        const form = await readFormBody(request);
        const notes = (form.notes ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
        const input = linkUpsertSchema.parse({
          linkId: form.linkId,
          sourceNodeId: form.sourceNodeId,
          targetNodeId: form.targetNodeId,
          transport: form.transport,
          status: form.status,
          label: form.label,
          notes
        });
        options.store.upsertLink(input);
        return redirect(response, "/");
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

      if (method === "POST" && url.pathname === "/api/nodes") {
        const input = nodeUpsertSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.upsertNode(input));
      }

      if (method === "POST" && url.pathname === "/api/links") {
        const input = linkUpsertSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.upsertLink(input));
      }

      if (method === "POST" && url.pathname === "/api/task-requests") {
        const input = taskRequestInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.requestTask(input));
      }

      if (method === "POST" && url.pathname === "/api/council/sessions") {
        const input = councilSessionInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.createCouncilSession(input));
      }

      if (method === "POST" && /^\/api\/council\/sessions\/[^/]+\/responses$/.test(url.pathname)) {
        const councilSessionId = url.pathname.split("/")[4];
        if (!councilSessionId) {
          throw new Error("Council session id is required.");
        }
        const input = councilResponseInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.store.addCouncilResponse(councilSessionId, input));
      }

      if (method === "POST" && /^\/api\/council\/sessions\/[^/]+\/close$/.test(url.pathname)) {
        const councilSessionId = url.pathname.split("/")[4];
        if (!councilSessionId) {
          throw new Error("Council session id is required.");
        }
        return sendJson(response, 200, options.store.closeCouncilSession(councilSessionId));
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
