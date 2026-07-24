import fs from "node:fs";
import path from "node:path";
import { resolveCanonicalRoot } from "../shared/canonical";
import { loopbackHubProbeUrls, resolveMissionControlHubUrl } from "../shared/env";
import {
  linkEvidencePackagesToIntegrityAlerts,
  listBase44AppsFromSnapshots,
  listBase44EvidencePackages,
  listBase44IntegrityAlerts
} from "./base44Snapshots";
import { listOsirisConnectorSummaries } from "./osirisSnapshots";
import { buildPlanSnapshot, evaluateDesktopControlReadiness } from "./operationalPlanner";
import { IntegrityReviewStore } from "./integrityReviewStore";
import { resolveDataPath, resolveMissionControlDataDir } from "../shared/paths";
import { HubState, hubStateSchema } from "../shared/types";
import type { PolicyAdoptionSummary } from "../shared/policyAdoptionObservation";
import {
  loadPolicyAdoptionObservation,
  summarizePolicyAdoption
} from "../infrastructure/council/policyAdoptionLoader";

export type CanonicalStatusExportOptions = {
  cwd?: string;
  canonicalRoot?: string;
  hubUrl?: string;
  hubStatePath?: string;
  dataDir?: string;
  inboxPath?: string;
  tokenPresent?: boolean;
  host?: string;
  refreshNetwork?: boolean;
  /** Read-only path to sanitized Council policy adoption observation JSON */
  policyAdoptionPath?: string;
};

export type HubReachability = {
  reachable: boolean;
  statusCode?: number;
  error?: string;
  manifestVersion?: string;
};

export type CanonicalStatusSnapshot = {
  generatedAtUtc: string;
  repoRoot: string;
  canonicalRoot: string | null;
  canonicalResolved: boolean;
  hub: {
    url: string;
    host: string;
    tokenPresent: boolean;
    reachable: boolean;
    manifestVersion?: string;
    statePath: string;
    stateExists: boolean;
    stateUpdatedAtUtc?: string;
  };
  counts: {
    nodes: number;
    links: number;
    devices: number;
    observations: number;
    pendingApprovals: number;
    openCouncilSessions: number;
    peerInboxMessages: number;
    base44Apps: number;
    integrityAlerts: number;
    unacknowledgedIntegrityAlerts: number;
    evidencePackages: number;
  };
  plan: ReturnType<typeof buildPlanSnapshot>;
  desktopControl: ReturnType<typeof evaluateDesktopControlReadiness>;
  nodes: Array<{
    nodeId: string;
    label: string;
    status: string;
    platform: string;
    lastSeenAt?: string;
  }>;
  links: Array<{
    linkId: string;
    label: string;
    transport: string;
    status: string;
    lastCheckedAt?: string;
    lastSucceededAt?: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    deviceId: string;
    taskId: string;
    requestedBy: string;
    requestedAt: string;
  }>;
  openCouncilSessions: Array<{
    id: string;
    topic: string;
    status: string;
    responseCount: number;
    updatedAt: string;
  }>;
  base44: Array<{
    appId: string;
    apiBase: string;
    lastSeenAt: string;
    snapshotCount: number;
    inventoryCheckedAt?: string;
    peekCount: number;
  }>;
  integrityAlerts: Array<{
    appId: string;
    id?: string;
    severity?: string;
    status?: string;
    signal_summary?: string;
    acknowledgedAt?: string;
  }>;
  refreshRitual: string[];
  /**
   * Read-only Council pack adoption status.
   * Mission Control must not write/merge context packs.
   */
  policyAdoption: PolicyAdoptionSummary;
};

export type CanonicalStatusWriteResult = {
  markdownPath?: string;
  logPath?: string;
  snapshot: CanonicalStatusSnapshot;
  markdown: string;
};

export { resolveCanonicalRoot } from "../shared/canonical";

export function loadHubStateFromDisk(statePath: string): { state: HubState; updatedAtUtc?: string } {
  if (!fs.existsSync(statePath)) {
    return { state: hubStateSchema.parse({}) };
  }

  const raw = fs.readFileSync(statePath, "utf8");
  const state = hubStateSchema.parse(JSON.parse(raw));
  const updatedAtUtc = fs.statSync(statePath).mtime.toUTCString();
  return { state, updatedAtUtc };
}

export function countPeerInboxMessages(inboxPath: string): number {
  if (!fs.existsSync(inboxPath)) {
    return 0;
  }

  return fs
    .readFileSync(inboxPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export async function probeHubReachability(hubUrl: string, timeoutMs = 2500): Promise<HubReachability> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${hubUrl.replace(/\/$/, "")}/.well-known/mission-control.json`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return { reachable: false, statusCode: response.status, error: `HTTP ${response.status}` };
    }

    const manifest = (await response.json()) as { version?: string };
    return {
      reachable: true,
      statusCode: response.status,
      manifestVersion: manifest.version
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reachable: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function ageMinutes(iso: string | undefined): number | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.round((Date.now() - parsed) / 60000);
}

export function buildCanonicalStatusSnapshot(
  options: CanonicalStatusExportOptions = {}
): CanonicalStatusSnapshot {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const canonicalRoot = options.canonicalRoot ?? resolveCanonicalRoot(process.env);
  const hubUrl = options.hubUrl ?? resolveMissionControlHubUrl(process.env);
  const host = options.host ?? process.env.MISSION_CONTROL_HOST?.trim() ?? "127.0.0.1";
  const tokenPresent = options.tokenPresent ?? Boolean(process.env.MISSION_CONTROL_TOKEN?.trim());
  const statePath = options.hubStatePath ?? resolveDataPath("hub-state.json");
  const dataDir = options.dataDir ?? resolveMissionControlDataDir();
  const inboxPath = options.inboxPath ?? resolveDataPath("inbox.jsonl");

  const { state, updatedAtUtc } = loadHubStateFromDisk(statePath);
  const plan = buildPlanSnapshot(state);
  const desktopControl = evaluateDesktopControlReadiness(state);
  const base44Apps = listBase44AppsFromSnapshots(dataDir);
  const integrityReviewStore = new IntegrityReviewStore(path.join(dataDir, "base44-integrity-reviews.json"));
  const integrityAlerts = linkEvidencePackagesToIntegrityAlerts(
    listBase44IntegrityAlerts(base44Apps),
    listBase44EvidencePackages(base44Apps)
  ).map((alert) => {
    if (!alert.id) {
      return alert;
    }
    const review = integrityReviewStore.get(alert.appId, alert.id);
    return review ? { ...alert, acknowledgedAt: review.acknowledgedAt, acknowledgedBy: review.actor } : alert;
  });
  const evidencePackages = listBase44EvidencePackages(base44Apps);
  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  const openCouncilSessions = state.councilSessions.filter((session) => session.status === "open");
  const policyAdoption = summarizePolicyAdoption(
    loadPolicyAdoptionObservation({
      filePath: options.policyAdoptionPath,
      env: process.env
    })
  );

  return {
    generatedAtUtc: new Date().toISOString(),
    repoRoot: cwd,
    canonicalRoot,
    canonicalResolved: Boolean(canonicalRoot && fs.existsSync(canonicalRoot)),
    hub: {
      url: hubUrl,
      host,
      tokenPresent,
      reachable: false,
      statePath,
      stateExists: fs.existsSync(statePath),
      stateUpdatedAtUtc: updatedAtUtc
    },
    counts: {
      nodes: Object.keys(state.nodes).length,
      links: Object.keys(state.links).length,
      devices: Object.keys(state.devices).length,
      observations: state.observations.length,
      pendingApprovals: pendingApprovals.length,
      openCouncilSessions: openCouncilSessions.length,
      peerInboxMessages: countPeerInboxMessages(inboxPath),
      base44Apps: base44Apps.length,
      integrityAlerts: integrityAlerts.length,
      unacknowledgedIntegrityAlerts: integrityAlerts.filter((alert) => !alert.acknowledgedAt).length,
      evidencePackages: evidencePackages.length
    },
    plan,
    desktopControl,
    policyAdoption,
    nodes: Object.values(state.nodes)
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((node) => ({
        nodeId: node.nodeId,
        label: node.label,
        status: node.status,
        platform: node.platform,
        lastSeenAt: node.lastSeenAt
      })),
    links: Object.values(state.links)
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((link) => ({
        linkId: link.linkId,
        label: link.label,
        transport: link.transport,
        status: link.status,
        lastCheckedAt: link.lastCheckedAt,
        lastSucceededAt: link.lastSucceededAt
      })),
    pendingApprovals: pendingApprovals.map((task) => ({
      id: task.id,
      deviceId: task.deviceId,
      taskId: task.taskId,
      requestedBy: task.requestedBy,
      requestedAt: task.requestedAt
    })),
    openCouncilSessions: openCouncilSessions.map((session) => ({
      id: session.id,
      topic: session.topic,
      status: session.status,
      responseCount: session.responses.length,
      updatedAt: session.updatedAt
    })),
    base44: base44Apps.map((app) => ({
      appId: app.appId,
      apiBase: app.apiBase,
      lastSeenAt: app.lastSeenAt,
      snapshotCount: app.snapshotCount,
      inventoryCheckedAt: app.latestInventory?.checkedAt,
      peekCount: app.latestPeeks.length
    })),
    integrityAlerts: integrityAlerts.slice(0, 12).map((alert) => ({
      appId: alert.appId,
      id: alert.id,
      severity: alert.severity,
      status: alert.status,
      signal_summary: alert.signal_summary,
      acknowledgedAt: alert.acknowledgedAt
    })),
    refreshRitual: [
      "npm run sync:tailscale",
      "npm run verify:tailscale",
      "MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> npm run verify:proliant-ssh",
      "npm run export:canonical-status"
    ]
  };
}

export async function enrichSnapshotWithHubReachability(
  snapshot: CanonicalStatusSnapshot,
  hubUrl?: string
): Promise<CanonicalStatusSnapshot> {
  const candidates = loopbackHubProbeUrls(hubUrl ?? snapshot.hub.url);
  let reachability: HubReachability = { reachable: false, error: "no probe attempted" };
  let resolvedUrl = candidates[0] ?? snapshot.hub.url;

  for (const candidate of candidates) {
    const result = await probeHubReachability(candidate);
    if (result.reachable) {
      reachability = result;
      resolvedUrl = candidate;
      break;
    }
    reachability = result;
  }

  const base = {
    ...snapshot,
    hub: {
      ...snapshot.hub,
      url: resolvedUrl,
      reachable: reachability.reachable,
      manifestVersion: reachability.manifestVersion
    }
  };

  if (!reachability.reachable) {
    return base;
  }

  try {
    const stateResponse = await fetch(`${resolvedUrl.replace(/\/$/, "")}/api/state`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!stateResponse.ok) {
      return base;
    }

    const payload = (await stateResponse.json()) as { state?: HubState };
    if (!payload.state) {
      return base;
    }

    const hubState = hubStateSchema.parse(payload.state);
    const openCouncilSessions = hubState.councilSessions.filter((session) => session.status === "open");

    let stateUpdatedAtUtc = snapshot.hub.stateUpdatedAtUtc;
    try {
      const manifestResponse = await fetch(`${resolvedUrl.replace(/\/$/, "")}/.well-known/mission-control.json`, {
        signal: AbortSignal.timeout(2500)
      });
      if (manifestResponse.ok) {
        const manifest = (await manifestResponse.json()) as {
          persistence?: { stateUpdatedAtUtc?: string };
        };
        stateUpdatedAtUtc = manifest.persistence?.stateUpdatedAtUtc ?? stateUpdatedAtUtc;
      }
    } catch {
      // keep disk mtime
    }

    return {
      ...base,
      hub: {
        ...base.hub,
        stateUpdatedAtUtc
      },
      counts: {
        ...base.counts,
        openCouncilSessions: openCouncilSessions.length
      },
      openCouncilSessions: openCouncilSessions.map((session) => ({
        id: session.id,
        topic: session.topic,
        status: session.status,
        responseCount: session.responses.length,
        updatedAt: session.updatedAt
      }))
    };
  } catch {
    return base;
  }
}

export function renderCanonicalStatusMarkdown(snapshot: CanonicalStatusSnapshot): string {
  const lines: string[] = [];
  lines.push("# Mission Control status");
  lines.push("");
  lines.push(`**Generated (UTC):** ${snapshot.generatedAtUtc}`);
  lines.push("");
  lines.push("## Hub");
  lines.push("");
  lines.push(`- **URL:** \`${snapshot.hub.url}\``);
  lines.push(`- **Bind host:** \`${snapshot.hub.host}\``);
  lines.push(`- **Token configured:** ${snapshot.hub.tokenPresent ? "yes" : "no"}`);
  lines.push(`- **Hub reachable now:** ${snapshot.hub.reachable ? "yes" : "no"}`);
  if (snapshot.hub.manifestVersion) {
    lines.push(`- **Discovery manifest version:** ${snapshot.hub.manifestVersion}`);
  }
  lines.push(`- **State file:** \`${snapshot.hub.statePath}\``);
  lines.push(`- **State exists:** ${snapshot.hub.stateExists ? "yes" : "no"}`);
  if (snapshot.hub.stateUpdatedAtUtc) {
    lines.push(`- **State last write (UTC):** ${snapshot.hub.stateUpdatedAtUtc}`);
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  for (const [key, value] of Object.entries(snapshot.counts)) {
    lines.push(`- **${key}:** ${value}`);
  }
  lines.push("");
  lines.push("## Policy adoption (read-only)");
  lines.push("");
  lines.push("_Council Context Pack Federation observation. Mission Control has no pack write/merge authority._");
  lines.push("");
  if (!snapshot.policyAdoption.observedAtUtc) {
    lines.push("_No adoption observation loaded._");
  } else {
    lines.push(`- **Observed (UTC):** ${snapshot.policyAdoption.observedAtUtc}`);
    if (snapshot.policyAdoption.producer) {
      lines.push(`- **Producer:** ${snapshot.policyAdoption.producer}`);
    }
    for (const [status, count] of Object.entries(snapshot.policyAdoption.counts)) {
      lines.push(`- **${status}:** ${count}`);
    }
    for (const item of snapshot.policyAdoption.observations.slice(0, 12)) {
      lines.push(
        `- \`${item.contextId}\` ${item.packId}@${item.packVersion} → **${item.adoptionStatus}**`
      );
    }
  }
  lines.push("");
  lines.push("## Operational truth");
  lines.push("");
  if (snapshot.plan.attention.length === 0) {
    lines.push("_No attention items._");
  } else {
    for (const item of snapshot.plan.attention) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");
  lines.push("### Suggested actions");
  lines.push("");
  if (snapshot.plan.suggestedActions.length === 0) {
    lines.push("_No suggested actions._");
  } else {
    for (const action of snapshot.plan.suggestedActions) {
      lines.push(`- ${action}`);
    }
  }
  lines.push("");
  lines.push("## Nodes");
  lines.push("");
  if (snapshot.nodes.length === 0) {
    lines.push("_No nodes registered._");
  } else {
    for (const node of snapshot.nodes) {
      const age = ageMinutes(node.lastSeenAt);
      const ageText = age === null ? "unknown age" : `${age}m ago`;
      lines.push(`- **${node.label}** (\`${node.nodeId}\`) · ${node.status} · ${node.platform} · last seen ${ageText}`);
    }
  }
  lines.push("");
  lines.push("## Links");
  lines.push("");
  if (snapshot.links.length === 0) {
    lines.push("_No links registered._");
  } else {
    for (const link of snapshot.links) {
      const checked = link.lastCheckedAt ? `checked ${link.lastCheckedAt}` : "not checked recently";
      lines.push(`- **${link.label}** · ${link.transport} · **${link.status}** · ${checked}`);
    }
  }
  lines.push("");
  lines.push("## Pending approvals");
  lines.push("");
  if (snapshot.pendingApprovals.length === 0) {
    lines.push("_No pending task approvals._");
  } else {
    for (const task of snapshot.pendingApprovals) {
      lines.push(
        `- \`${task.id}\` · ${task.taskId} on ${task.deviceId} · requested by ${task.requestedBy} at ${task.requestedAt}`
      );
    }
  }
  lines.push("");
  lines.push("## Open council sessions");
  lines.push("");
  if (snapshot.openCouncilSessions.length === 0) {
    lines.push("_No open council sessions._");
  } else {
    for (const session of snapshot.openCouncilSessions) {
      lines.push(
        `- **${session.topic}** (\`${session.id}\`) · ${session.responseCount} responses · updated ${session.updatedAt}`
      );
    }
  }
  lines.push("");
  lines.push("## Base44 snapshots");
  lines.push("");
  if (snapshot.base44.length === 0) {
    lines.push("_No Base44 snapshot data in `.mission-control/data`._");
  } else {
    for (const app of snapshot.base44) {
      lines.push(
        `- **${app.appId}** · ${app.snapshotCount} snapshots · inventory ${app.inventoryCheckedAt ?? "missing"} · ${app.peekCount} peeks`
      );
    }
  }
  lines.push("");
  lines.push("## Integrity review queue");
  lines.push("");
  if (snapshot.integrityAlerts.length === 0) {
    lines.push("_No integrity alerts in latest peeks._");
  } else {
    for (const alert of snapshot.integrityAlerts) {
      const ack = alert.acknowledgedAt ? "acknowledged" : "open";
      lines.push(
        `- **${alert.appId}** · ${alert.severity ?? "unknown"} · ${alert.status ?? "unknown"} · ${ack} · ${alert.signal_summary ?? "no summary"}`
      );
    }
  }
  lines.push("");
  lines.push("## Desktop control readiness");
  lines.push("");
  lines.push(`- **Recommendation:** ${snapshot.desktopControl.recommendation}`);
  if (snapshot.desktopControl.reasons.length === 0) {
    lines.push("- **Reasons:** none");
  } else {
    for (const reason of snapshot.desktopControl.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  lines.push("## Osiris Rising connectors");
  lines.push("");
  const osirisConnectors = listOsirisConnectorSummaries(snapshot.repoRoot);
  if (osirisConnectors.length === 0) {
    lines.push("_No Osiris snapshot in `.mission-control/data/osiris-snapshot.json`. Run `osiris-rising-app/scripts` `npm run sync:bridges`._");
  } else {
    for (const connector of osirisConnectors) {
      const countSummary = Object.entries(connector.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      lines.push(
        `- **${connector.connectorId}** · ${connector.status} · ${connector.message || "no message"}${countSummary ? ` · ${countSummary}` : ""}`,
      );
    }
    lines.push("");
    lines.push("- **Operator surface:** `30_CODE/osiris-rising-app`");
  }
  lines.push("");
  lines.push("## CANONICAL link");
  lines.push("");
  if (!snapshot.canonicalResolved || !snapshot.canonicalRoot) {
    lines.push("_CANONICAL root not resolved. Set `CANONICAL_ROOT` or `MISSION_CONTROL_CANONICAL_ROOT`._");
  } else {
    lines.push(`- **Root:** \`${snapshot.canonicalRoot}\``);
    lines.push("- **Role:** private runtime awareness layer (not public site, not Base44 source of truth)");
  }
  lines.push("");
  lines.push("## Refresh ritual");
  lines.push("");
  lines.push("Run from the Mission Control repo after network changes:");
  lines.push("");
  lines.push("```text");
  for (const command of snapshot.refreshRitual) {
    lines.push(command);
  }
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

export function writeCanonicalStatusExport(
  snapshot: CanonicalStatusSnapshot,
  markdown: string,
  options: { noWrite?: boolean } = {}
): CanonicalStatusWriteResult {
  if (options.noWrite || !snapshot.canonicalResolved || !snapshot.canonicalRoot) {
    return { snapshot, markdown };
  }

  const remindersDir = path.join(snapshot.canonicalRoot, "01_OPS", "REMINDERS");
  const logsDir = path.join(snapshot.canonicalRoot, "01_OPS", "LOGS");
  fs.mkdirSync(remindersDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const markdownPath = path.join(remindersDir, "MISSION_CONTROL_LAST.md");
  const logPath = path.join(logsDir, `mission_control_status_${snapshot.generatedAtUtc.slice(0, 10)}.log`);

  fs.writeFileSync(markdownPath, markdown, "utf8");
  fs.appendFileSync(logPath, `${JSON.stringify(snapshot)}\n`, "utf8");

  return {
    markdownPath,
    logPath,
    snapshot,
    markdown
  };
}
