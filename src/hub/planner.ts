import { DesktopControlEvaluation, DeviceRecord, HubState, Observation, PlanSnapshot, nowIso } from "../shared/types";

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

  return Array.from(new Set(actions));
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

  return {
    createdAt: nowIso(),
    deviceSummaries: devices.map((device) => summarizeDevice(device, getLatestObservation(state, device.deviceId))),
    attention: collectAttention(state, devices),
    suggestedActions: collectSuggestedActions(state, devices),
    notes: collectNotes(state, devices)
  };
}
