import { DesktopControlEvaluation, DeviceRecord, HubState, NodeRecord, Observation, PlanSnapshot, nowIso } from "../shared/types";

function getLatestObservation(state: HubState, deviceId: string): Observation | undefined {
  return [...state.observations].reverse().find((entry) => entry.deviceId === deviceId);
}

function ageMinutes(iso: string): number {
  return Math.round((Date.now() - Date.parse(iso)) / 60000);
}

export function evaluateDesktopControlReadiness(state: HubState): DesktopControlEvaluation {
  const reasons: string[] = [];
  const deviceCount = Object.keys(state.devices).length;
  const observationCount = state.observations.length;
  const completedTasks = state.taskRequests.filter((task) => task.status === "completed").length;
  const failedTasks = state.taskRequests.filter((task) => task.status === "failed").length;
  const riskyDevices = Object.values(state.devices).filter(
    (device) => device.permissions.desktopControl || device.permissions.shell
  );

  if (deviceCount < 2) {
    reasons.push("Need at least two connected devices before evaluating desktop pilot value.");
  }
  if (observationCount < 5) {
    reasons.push("Need more observation history to understand normal behavior across devices.");
  }
  if (completedTasks < 3) {
    reasons.push("Approval-gated task execution has not been exercised enough to justify direct control.");
  }
  if (failedTasks > completedTasks) {
    reasons.push("Task failures are still too common; keep desktop control disabled until automation is steadier.");
  }
  if (riskyDevices.length > 0) {
    reasons.push("Desktop control remains off-by-default because one or more devices already allow elevated actions.");
  }

  return {
    recommendation: reasons.length === 0 ? "pilot_ready" : "not_ready",
    reasons,
    checkedAt: nowIso()
  };
}

function summarizeDevice(device: DeviceRecord, observation: Observation | undefined): string {
  if (!observation) {
    return `${device.displayName} (${device.platform}) is registered but has not reported context yet.`;
  }

  const parts = [
    `${device.displayName} (${device.platform})`,
    `${ageMinutes(observation.capturedAt)}m ago`,
    observation.activeWindow ? `window: ${observation.activeWindow}` : undefined,
    observation.workspace ? `workspace: ${observation.workspace}` : undefined,
    observation.summary
  ].filter(Boolean);

  return parts.join(" | ");
}

function collectAttention(state: HubState, devices: DeviceRecord[]): string[] {
  const attention: string[] = [];

  for (const device of devices) {
    const observation = getLatestObservation(state, device.deviceId);
    if (!observation) {
      attention.push(`${device.displayName} has no observations yet.`);
      continue;
    }

    if (ageMinutes(observation.capturedAt) >= 15) {
      attention.push(`${device.displayName} has stale context (${ageMinutes(observation.capturedAt)} minutes old).`);
    }

    const unhealthyServices = observation.services.filter((service) => service.status.toLowerCase() !== "running");
    if (unhealthyServices.length > 0) {
      attention.push(
        `${device.displayName} reports services needing attention: ${unhealthyServices
          .map((service) => `${service.name}=${service.status}`)
          .join(", ")}.`
      );
    }
  }

  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  if (pendingApprovals.length > 0) {
    attention.push(`There are ${pendingApprovals.length} task requests waiting for approval.`);
  }

  const failedTasks = state.taskRequests.filter((task) => task.status === "failed").slice(-3);
  for (const task of failedTasks) {
    attention.push(`Task ${task.taskId} on ${task.deviceId} failed: ${task.resultSummary ?? "no summary provided"}.`);
  }

  const blockedLinks = Object.values(state.links).filter((link) => link.status === "blocked" || link.status === "offline");
  for (const link of blockedLinks) {
    attention.push(`Link ${link.label} is ${link.status} and may block cross-system work.`);
  }

  const relayLinks = Object.values(state.links).filter(
    (link) => link.transport === "tailscale" && link.notes.some((note) => note === "Route quality relay")
  );
  for (const link of relayLinks) {
    attention.push(`Link ${link.label} is working through relay routing, so latency may be higher than a direct tailnet path.`);
  }

  return attention;
}

function collectSuggestedActions(state: HubState, devices: DeviceRecord[]): string[] {
  const actions: string[] = [];

  for (const device of devices) {
    const observation = getLatestObservation(state, device.deviceId);
    if (!observation || ageMinutes(observation.capturedAt) >= 15) {
      actions.push(`Request a fresh observation from ${device.displayName}.`);
    }
    if (device.permissions.taskExecution === "approval") {
      actions.push(`Keep ${device.displayName} on approval-gated tasks until usage patterns stabilize.`);
    }
  }

  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  if (pendingApprovals.length > 0) {
    actions.push("Review the approval queue and decide which named tasks should run next.");
  }

  const desktopControl = evaluateDesktopControlReadiness(state);
  if (desktopControl.recommendation === "not_ready") {
    actions.push("Leave desktop control disabled until the observer-first workflow has enough history and successful tasks.");
  } else {
    actions.push("A narrowly scoped desktop pilot can be trialed on one device with session recording enabled.");
  }

  const relayLinks = Object.values(state.links).filter(
    (link) => link.transport === "tailscale" && link.notes.some((note) => note === "Route quality relay")
  );
  if (relayLinks.length > 0) {
    actions.push("Keep verified Tailscale links available, but treat direct-path tuning as a latency optimization rather than a connectivity emergency.");
  }

  return Array.from(new Set(actions));
}

function collectSilentLoop(state: HubState, devices: DeviceRecord[], nodes: NodeRecord[]): string[] {
  const loop: string[] = [];

  for (const node of nodes) {
    if (node.status === "partial" || node.status === "reachable") {
      const pathHints = [
        node.reachability.tailscale ? "tailscale" : undefined,
        node.reachability.ssh ? "ssh" : undefined,
        node.reachability.localAgent ? "local-agent" : undefined,
        node.reachability.companion ? "companion" : undefined
      ]
        .filter(Boolean)
        .join(", ");
      loop.push(`Keep nudging ${node.label} toward active integration via ${pathHints || "known paths"}.`);
    }

    if (node.status === "offline") {
      loop.push(`Recheck whether ${node.label} is reachable before routing work through it.`);
    }
  }

  for (const device of devices) {
    const observation = getLatestObservation(state, device.deviceId);
    if (!observation || ageMinutes(observation.capturedAt) >= 15) {
      loop.push(`Background follow-up: refresh context for ${device.displayName}.`);
    }
  }

  const openCouncilSessions = state.councilSessions.filter((session) => session.status === "open");
  for (const session of openCouncilSessions) {
    if (session.responses.length === 0) {
      loop.push(`Council session "${session.topic}" still needs first responses.`);
      continue;
    }

    const hasBlocker = session.responses.some((response) => response.stance === "block");
    const hasConcern = session.responses.some((response) => response.stance === "concern");

    if (hasBlocker) {
      loop.push(`Council session "${session.topic}" has a blocker to resolve quietly before the next run.`);
    } else if (hasConcern) {
      loop.push(`Council session "${session.topic}" has concerns worth revisiting in the next background pass.`);
    }
  }

  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  if (pendingApprovals.length > 0) {
    loop.push(`Approval queue still has ${pendingApprovals.length} request(s) waiting.`);
  }

  const inProgressLinks = Object.values(state.links).filter(
    (link) => link.status === "planned" || link.status === "attempting" || link.status === "reachable"
  );
  for (const link of inProgressLinks) {
    loop.push(`Keep advancing link "${link.label}" from ${link.status} to verified.`);
  }

  return Array.from(new Set(loop));
}

function collectNotes(state: HubState, devices: DeviceRecord[]): string[] {
  const notes: string[] = [];

  for (const device of devices) {
    const observation = getLatestObservation(state, device.deviceId);
    if (!observation) {
      continue;
    }

    if (observation.notes.length > 0) {
      notes.push(`${device.displayName}: ${observation.notes.join(" ")}`);
    } else {
      notes.push(`${device.displayName}: ${observation.summary}`);
    }
  }

  if (state.observations.length === 0) {
    notes.push("No observations have been stored yet.");
  }

  return notes;
}

export function buildPlanSnapshot(state: HubState): PlanSnapshot {
  const devices = Object.values(state.devices);
  const nodes = Object.values(state.nodes);

  return {
    createdAt: nowIso(),
    deviceSummaries: devices.map((device) => summarizeDevice(device, getLatestObservation(state, device.deviceId))),
    attention: collectAttention(state, devices),
    suggestedActions: collectSuggestedActions(state, devices),
    silentLoop: collectSilentLoop(state, devices, nodes),
    notes: collectNotes(state, devices)
  };
}
