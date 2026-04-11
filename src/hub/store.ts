import fs from "node:fs";
import path from "node:path";
import {
  DeviceRegistration,
  HubState,
  Observation,
  PlanSnapshot,
  TaskDecisionInput,
  TaskRequest,
  TaskRequestInput,
  TaskResultInput,
  generateId,
  hubStateSchema,
  nowIso
} from "../shared/types";
import { buildPlanSnapshot, evaluateDesktopControlReadiness } from "./planner";

export class MissionControlStore {
  private state: HubState;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.state = this.load();
    this.refreshDerivedState();
  }

  getState(): HubState {
    return structuredClone(this.state);
  }

  registerDevice(input: DeviceRegistration) {
    const timestamp = nowIso();
    const existing = this.state.devices[input.deviceId];

    this.state.devices[input.deviceId] = {
      ...input,
      registeredAt: existing?.registeredAt ?? timestamp,
      lastSeenAt: timestamp
    };

    this.refreshDerivedState();
    this.save();
    return this.state.devices[input.deviceId];
  }

  addObservation(observation: Observation): Observation {
    const device = this.state.devices[observation.deviceId];
    if (device) {
      device.lastSeenAt = observation.capturedAt;
      device.taskCatalog = observation.taskCatalog;
    }

    this.state.observations.push(observation);
    this.state.observations = this.state.observations.slice(-250);
    this.refreshDerivedState();
    this.save();
    return observation;
  }

  requestTask(input: TaskRequestInput): TaskRequest {
    const device = this.state.devices[input.deviceId];
    if (!device) {
      throw new Error(`Unknown device: ${input.deviceId}`);
    }

    const task = device.taskCatalog.find((entry) => entry.id === input.taskId);
    if (!task) {
      throw new Error(`Task ${input.taskId} is not exposed by device ${input.deviceId}`);
    }

    const requestedAt = nowIso();
    const approvalRequired = device.permissions.taskExecution !== "trusted" || task.requiresApproval;
    const taskRequest: TaskRequest = {
      id: generateId("task"),
      deviceId: input.deviceId,
      taskId: input.taskId,
      arguments: input.arguments,
      requestedBy: input.requestedBy,
      requestedAt,
      status: approvalRequired ? "pending" : "approved",
      approvalRequired,
      updatedAt: requestedAt,
      approvedAt: approvalRequired ? undefined : requestedAt,
      approvedBy: approvalRequired ? undefined : "policy"
    };

    this.state.taskRequests.push(taskRequest);
    this.refreshDerivedState();
    this.save();
    return taskRequest;
  }

  decideTask(taskRequestId: string, input: TaskDecisionInput): TaskRequest {
    const task = this.state.taskRequests.find((entry) => entry.id === taskRequestId);
    if (!task) {
      throw new Error(`Unknown task request: ${taskRequestId}`);
    }
    if (task.status !== "pending") {
      throw new Error(`Task request ${taskRequestId} is not pending.`);
    }

    task.status = input.approved ? "approved" : "rejected";
    task.approvedAt = nowIso();
    task.approvedBy = input.actor;
    task.updatedAt = task.approvedAt;
    task.rejectedReason = input.approved ? undefined : input.reason ?? "Rejected";

    this.refreshDerivedState();
    this.save();
    return task;
  }

  updateTaskResult(taskRequestId: string, input: TaskResultInput): TaskRequest {
    const task = this.state.taskRequests.find((entry) => entry.id === taskRequestId);
    if (!task) {
      throw new Error(`Unknown task request: ${taskRequestId}`);
    }

    task.status = input.status;
    task.updatedAt = nowIso();
    task.resultSummary = input.resultSummary;
    task.resultDetail = input.resultDetail;

    this.refreshDerivedState();
    this.save();
    return task;
  }

  getApprovedTasks(deviceId: string): TaskRequest[] {
    return this.state.taskRequests.filter(
      (task) => task.deviceId === deviceId && (task.status === "approved" || task.status === "executing")
    );
  }

  getPendingApprovals(): TaskRequest[] {
    return this.state.taskRequests.filter((task) => task.status === "pending");
  }

  getLatestPlan(): PlanSnapshot {
    return this.state.planSnapshots.at(-1) ?? buildPlanSnapshot(this.state);
  }

  private load(): HubState {
    if (!fs.existsSync(this.filePath)) {
      return hubStateSchema.parse({});
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return hubStateSchema.parse(JSON.parse(raw));
  }

  private refreshDerivedState(): void {
    this.state.desktopControlEvaluation = evaluateDesktopControlReadiness(this.state);
    this.state.planSnapshots.push(buildPlanSnapshot(this.state));
    this.state.planSnapshots = this.state.planSnapshots.slice(-100);
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }
}
