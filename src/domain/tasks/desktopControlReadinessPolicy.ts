import { DesktopControlEvaluation, DeviceRecord, HubState, TaskRequest, nowIso } from "../../shared/types";

export type DesktopControlReadinessInput = {
  devices: DeviceRecord[];
  observationsCount: number;
  taskRequests: TaskRequest[];
};

export function buildDesktopControlReadinessInput(state: HubState): DesktopControlReadinessInput {
  return {
    devices: Object.values(state.devices),
    observationsCount: state.observations.length,
    taskRequests: state.taskRequests
  };
}

export class DesktopControlReadinessPolicy {
  evaluate(input: DesktopControlReadinessInput): DesktopControlEvaluation {
    const reasons: string[] = [];
    const deviceCount = input.devices.length;
    const completedTasks = input.taskRequests.filter((task) => task.status === "completed").length;
    const failedTasks = input.taskRequests.filter((task) => task.status === "failed").length;
    const riskyDevices = input.devices.filter(
      (device) => device.permissions.desktopControl || device.permissions.shell
    );

    if (deviceCount < 2) {
      reasons.push("Need at least two connected devices before evaluating desktop pilot value.");
    }
    if (input.observationsCount < 5) {
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
}

export const desktopControlReadinessPolicy = new DesktopControlReadinessPolicy();

export function evaluateDesktopControlReadiness(state: HubState): DesktopControlEvaluation {
  return desktopControlReadinessPolicy.evaluate(buildDesktopControlReadinessInput(state));
}
