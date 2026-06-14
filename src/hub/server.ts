import http from "node:http";
import { URL } from "node:url";
import { badRequest, notFound, readFormBody, readJsonBody, redirect, sendHtml, sendJson, unauthorized } from "../shared/http";
import { getAiMemoryOverview, listAiMemoryRecordsByQuery } from "./aiMemory";
import { refreshBase44Inventory, refreshBase44Peek } from "./base44Refresh";
import { IntegrityReviewStore } from "./integrityReviewStore";
import {
  councilResponseInputSchema,
  councilSessionInputSchema,
  deviceRegistrationSchema,
  linkUpsertSchema,
  nodeUpsertSchema,
  observationSchema,
  peerInboxInputSchema,
  taskDecisionSchema,
  taskRequestInputSchema,
  taskResultInputSchema
} from "../shared/types";
import { PeerInboxStore } from "./inbox";
import {
  linkEvidencePackagesToIntegrityAlerts,
  listBase44AppsFromSnapshots,
  listBase44EvidencePackages,
  listBase44IntegrityAlerts
} from "./base44Snapshots";
import { listOsirisConnectorSummaries, readOsirisSnapshotFile } from "./osirisSnapshots";
import { renderDashboard } from "./html";
import { MissionControlStore } from "./store";

type HubServerOptions = {
  port: number;
  host?: string;
  store: MissionControlStore;
  inbox: PeerInboxStore;
  integrityReviews: IntegrityReviewStore;
  sharedToken?: string;
};

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function assertSafeHubExposure(host: string, sharedToken: string | undefined): void {
  if (sharedToken || isLoopbackHost(host)) {
    return;
  }

  throw new Error(
    `Refusing to start Mission Control on ${host} without MISSION_CONTROL_TOKEN. Set MISSION_CONTROL_TOKEN or bind to 127.0.0.1.`
  );
}

function assertAuthorized(token: string | undefined, authHeader: string | undefined): boolean {
  if (!token) {
    return true;
  }

  return authHeader === `Bearer ${token}`;
}

function requireAuthorized(
  response: http.ServerResponse,
  token: string | undefined,
  authHeader: string | undefined
): boolean {
  if (assertAuthorized(token, authHeader)) {
    return true;
  }

  unauthorized(response);
  return false;
}

function buildDiscoveryManifest(options: HubServerOptions, requestUrl: URL) {
  const origin = requestUrl.origin;
  const bindHost = options.host ?? "127.0.0.1";
  return {
    name: "device-mission-control",
    description: "Observer-first coordination hub for machines, links, devices, agents, and council sessions.",
    network: {
      bindHost,
      writeExposure: options.sharedToken ? "token-protected" : "loopback-only"
    },
    auth: options.sharedToken
      ? {
          mode: "bearer",
          note: "Write operations and agent task polling require Authorization: Bearer <MISSION_CONTROL_TOKEN>."
        }
      : {
          mode: "open-local",
          note: "Browser actions and JSON writes are enabled only on the loopback-bound local hub because MISSION_CONTROL_TOKEN is not configured."
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
        get: `${origin}/api/council/sessions/<sessionId>`,
        create: `${origin}/api/council/sessions`,
        respond: `${origin}/api/council/sessions/<sessionId>/responses`,
        close: `${origin}/api/council/sessions/<sessionId>/close`
      },
      evaluation: {
        desktopControl: `${origin}/api/desktop-control/evaluation`
      },
      integrations: {
        aiMemoryOverview: `${origin}/api/ai/overview`,
        aiMemoryRecords: `${origin}/api/ai/records?kind=decision|handoff|runbook`,
        base44Snapshots: `${origin}/api/base44/snapshots`,
        base44IntegrityAlerts: `${origin}/api/base44/integrity-alerts`,
        base44EvidencePackages: `${origin}/api/base44/evidence-packages`,
        osirisSnapshots: `${origin}/api/osiris/snapshots`,
        refreshOsirisSnapshot: `${origin}/api/osiris/refresh`,
        refreshInventory: `${origin}/api/base44/refresh-inventory`,
        refreshPeek: `${origin}/api/base44/refresh-peek`,
        acknowledgeIntegrityAlert: `${origin}/api/base44/integrity-alerts/acknowledge`,
        openIntegrityCouncil: `${origin}/api/base44/integrity-alerts/open-council`,
        runEvidenceCheck: `${origin}/api/base44/integrity-alerts/evidence-check`
      }
    },
    suggestedBootOrder: [
      "GET /.well-known/mission-control.json",
      "GET /api/state",
      "GET /api/nodes",
      "GET /api/links"
    ],
    persistence: {
      statePath: options.store.getStateFilePath(),
      stateUpdatedAtUtc: options.store.getStateFileUpdatedAtUtc()
    }
  };
}

export function createHubServer(options: HubServerOptions) {
  const host = options.host ?? "127.0.0.1";
  assertSafeHubExposure(host, options.sharedToken);

  const server = http.createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      const base44Apps = listBase44AppsFromSnapshots();
      const base44EvidencePackages = listBase44EvidencePackages(base44Apps);
      const aiMemoryOverview = getAiMemoryOverview();
      const base44IntegrityAlerts = linkEvidencePackagesToIntegrityAlerts(
        listBase44IntegrityAlerts(base44Apps),
        base44EvidencePackages
      ).map((alert) => {
        if (!alert.id) {
          return alert;
        }

        const review = options.integrityReviews.get(alert.appId, alert.id);
        return review
          ? {
              ...alert,
              acknowledgedAt: review.acknowledgedAt,
              acknowledgedBy: review.actor
            }
          : alert;
      });

      if (method === "GET" && url.pathname === "/") {
        return sendHtml(
          response,
          renderDashboard(options.store.getState(), options.store.getLatestPlan(), {
            inboxMessages: options.inbox.list(50),
            interactive: !options.sharedToken,
            base44Apps,
            base44IntegrityAlerts,
            base44EvidencePackages,
            aiMemoryOverview
          })
        );
      }

      if (method === "GET" && url.pathname === "/v1/inbox") {
        const limit = Number(url.searchParams.get("limit") ?? "50");
        return sendJson(response, 200, {
          messages: options.inbox.list(Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50)
        });
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

      if (method === "GET" && url.pathname === "/api/ai/overview") {
        return sendJson(response, 200, aiMemoryOverview);
      }

      if (method === "GET" && url.pathname === "/api/ai/records") {
        return sendJson(response, 200, {
          records: listAiMemoryRecordsByQuery(url.searchParams.get("kind") ?? undefined)
        });
      }

      if (method === "GET" && url.pathname === "/api/osiris/snapshots") {
        return sendJson(response, 200, {
          snapshot: readOsirisSnapshotFile(process.cwd()),
          connectors: listOsirisConnectorSummaries(process.cwd()),
        });
      }

      if (method === "GET" && url.pathname === "/api/base44/snapshots") {
        return sendJson(response, 200, base44Apps);
      }

      if (method === "GET" && url.pathname === "/api/base44/integrity-alerts") {
        return sendJson(response, 200, base44IntegrityAlerts);
      }

      if (method === "GET" && url.pathname === "/api/base44/evidence-packages") {
        return sendJson(response, 200, base44EvidencePackages);
      }

      if (method === "GET" && /^\/api\/council\/sessions\/[^/]+$/.test(url.pathname)) {
        const councilSessionId = url.pathname.split("/")[4];
        if (!councilSessionId) {
          throw new Error("Council session id is required.");
        }
        const session = options.store.getCouncilSession(councilSessionId);
        if (!session) {
          return notFound(response);
        }
        return sendJson(response, 200, session);
      }

      if (method === "GET" && url.pathname === "/api/council/sessions") {
        return sendJson(response, 200, options.store.getCouncilSessions());
      }

      if (method === "GET" && url.pathname === "/api/task-requests") {
        if (!requireAuthorized(response, options.sharedToken, request.headers.authorization)) {
          return;
        }
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

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/inbox") {
        const form = await readFormBody(request);
        const input = peerInboxInputSchema.parse({
          role: form.role,
          text: form.text
        });
        options.inbox.append(input);
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/base44/inventory-refresh") {
        const form = await readFormBody(request);
        refreshBase44Inventory(process.cwd(), {
          appId: form.appId ?? "",
          apiBase: form.apiBase ?? "",
          limit: form.limit ? Number(form.limit) : undefined,
          sortBy: form.sortBy || undefined
        });
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/base44/peek-refresh") {
        const form = await readFormBody(request);
        refreshBase44Peek(process.cwd(), {
          appId: form.appId ?? "",
          apiBase: form.apiBase ?? "",
          entity: form.entity ?? "",
          limit: form.limit ? Number(form.limit) : undefined,
          sortBy: form.sortBy || undefined,
          query: form.query ? JSON.parse(form.query) : undefined,
          requestedFields: form.fields
            ? form.fields
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
            : undefined
        });
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/base44/integrity-alerts/acknowledge") {
        const form = await readFormBody(request);
        options.integrityReviews.acknowledge({
          appId: form.appId ?? "",
          alertId: form.alertId ?? "",
          actor: form.actor || "dashboard",
          note: form.note || undefined,
          alertType: form.alertType || undefined,
          signalSummary: form.signalSummary || undefined
        });
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/base44/integrity-alerts/open-council") {
        const form = await readFormBody(request);
        const alertId = form.alertId ?? "";
        const alertType = form.alertType ?? "IntegrityAlert";
        const severity = form.severity ?? "unknown";
        const status = form.status ?? "unknown";
        const signalSummary = form.signalSummary ?? "No summary captured.";
        options.store.createCouncilSession({
          topic: `Integrity alert ${alertType}`,
          prompt: `Review Base44 integrity alert ${alertId}.\nSeverity: ${severity}\nStatus: ${status}\nSummary: ${signalSummary}`,
          requestedBy: "base44-integrity-queue",
          targetMemberIds: ["windows-main", "linux-home-server"]
        });
        return redirect(response, "/");
      }

      if (!options.sharedToken && method === "POST" && url.pathname === "/actions/base44/integrity-alerts/evidence-check") {
        const form = await readFormBody(request);
        refreshBase44Peek(process.cwd(), {
          appId: form.appId ?? "",
          apiBase: form.apiBase ?? "",
          entity: "EvidencePackage",
          query: form.alertId ? { alert_id: form.alertId } : undefined,
          requestedFields: ["package_id", "package_status", "alert_id", "retention_until", "confidential"]
        });
        return redirect(response, "/");
      }

      if (!assertAuthorized(options.sharedToken, request.headers.authorization)) {
        return unauthorized(response);
      }

      if (method === "POST" && url.pathname === "/v1/inbox") {
        const input = peerInboxInputSchema.parse(await readJsonBody(request));
        return sendJson(response, 201, options.inbox.append(input));
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

      if (method === "POST" && url.pathname === "/api/osiris/refresh") {
        return sendJson(response, 200, {
          ok: true,
          message:
            "Osiris snapshot refresh is handled by osiris-rising-app/scripts sync:bridges on the operator machine.",
          connectors: listOsirisConnectorSummaries(process.cwd()),
        });
      }

      if (method === "POST" && url.pathname === "/api/base44/refresh-inventory") {
        const input = (await readJsonBody(request)) as Record<string, unknown>;
        return sendJson(
          response,
          200,
          refreshBase44Inventory(process.cwd(), {
            appId: String(input.appId ?? ""),
            apiBase: String(input.apiBase ?? ""),
            limit: typeof input.limit === "number" ? input.limit : undefined,
            sortBy: typeof input.sortBy === "string" ? input.sortBy : undefined
          })
        );
      }

      if (method === "POST" && url.pathname === "/api/base44/refresh-peek") {
        const input = (await readJsonBody(request)) as Record<string, unknown>;
        return sendJson(
          response,
          200,
          refreshBase44Peek(process.cwd(), {
            appId: String(input.appId ?? ""),
            apiBase: String(input.apiBase ?? ""),
            entity: String(input.entity ?? ""),
            limit: typeof input.limit === "number" ? input.limit : undefined,
            sortBy: typeof input.sortBy === "string" ? input.sortBy : undefined,
            query:
              input.query && typeof input.query === "object" && !Array.isArray(input.query)
                ? (input.query as Record<string, unknown>)
                : undefined,
            requestedFields: Array.isArray(input.requestedFields)
              ? input.requestedFields.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : undefined
          })
        );
      }

      if (method === "POST" && url.pathname === "/api/base44/integrity-alerts/acknowledge") {
        const input = (await readJsonBody(request)) as Record<string, unknown>;
        return sendJson(
          response,
          200,
          options.integrityReviews.acknowledge({
            appId: String(input.appId ?? ""),
            alertId: String(input.alertId ?? ""),
            actor: String(input.actor ?? "api"),
            note: typeof input.note === "string" ? input.note : undefined,
            alertType: typeof input.alertType === "string" ? input.alertType : undefined,
            signalSummary: typeof input.signalSummary === "string" ? input.signalSummary : undefined
          })
        );
      }

      if (method === "POST" && url.pathname === "/api/base44/integrity-alerts/open-council") {
        const input = (await readJsonBody(request)) as Record<string, unknown>;
        return sendJson(
          response,
          201,
          options.store.createCouncilSession({
            topic: `Integrity alert ${String(input.alertType ?? "IntegrityAlert")}`,
            prompt: `Review Base44 integrity alert ${String(input.alertId ?? "")}.\nSeverity: ${String(
              input.severity ?? "unknown"
            )}\nStatus: ${String(input.status ?? "unknown")}\nSummary: ${String(input.signalSummary ?? "No summary captured.")}`,
            requestedBy: "base44-integrity-queue",
            targetMemberIds: ["windows-main", "linux-home-server"]
          })
        );
      }

      if (method === "POST" && url.pathname === "/api/base44/integrity-alerts/evidence-check") {
        const input = (await readJsonBody(request)) as Record<string, unknown>;
        return sendJson(
          response,
          200,
          refreshBase44Peek(process.cwd(), {
            appId: String(input.appId ?? ""),
            apiBase: String(input.apiBase ?? ""),
            entity: "EvidencePackage",
            query: input.alertId ? { alert_id: String(input.alertId) } : undefined,
            requestedFields: ["package_id", "package_status", "alert_id", "retention_until", "confidential"]
          })
        );
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
        server.listen(options.port, host, resolve);
      });
    }
  };
}
