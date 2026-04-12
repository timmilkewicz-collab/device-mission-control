import fs from "node:fs";
import path from "node:path";
import {
  CouncilResponseInput,
  CouncilSession,
  CouncilSessionInput,
  DeviceRegistration,
  HubState,
  NodeRecord,
  NodeUpsertInput,
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

    const existingNode = this.state.nodes[input.deviceId];
    this.state.nodes[input.deviceId] = {
      nodeId: input.deviceId,
      label: input.displayName,
      kind: input.platform === "windows" ? "machine" : input.tags.includes("server") ? "server" : "machine",
      platform: input.platform,
      status: "active",
      linkedDeviceId: input.deviceId,
      linkedNodeIds: existingNode?.linkedNodeIds ?? [],
      agentSurfaces: Array.from(new Set([...(existingNode?.agentSurfaces ?? []), "mission-control-agent"])),
      capabilities: input.capabilities,
      reachability: existingNode?.reachability ?? {
        tailscale: false,
        ssh: input.platform === "linux",
        localAgent: true,
        companion: false,
        notes: []
      },
      tags: Array.from(new Set(input.tags)),
      notes: existingNode?.notes ?? [],
      lastSeenAt: timestamp,
      registeredAt: existingNode?.registeredAt ?? timestamp,
      updatedAt: timestamp
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

    const node = this.state.nodes[observation.deviceId];
    if (node) {
      node.lastSeenAt = observation.capturedAt;
      node.updatedAt = nowIso();
      if (node.status === "discovered" || node.status === "reachable" || node.status === "partial") {
        node.status = "active";
      }
    }

    this.state.observations.push(observation);
    this.state.observations = this.state.observations.slice(-250);
    this.refreshDerivedState();
    this.save();
    return observation;
  }

  upsertNode(input: NodeUpsertInput): NodeRecord {
    const timestamp = nowIso();
    const existing = this.state.nodes[input.nodeId];
    const node: NodeRecord = {
      nodeId: input.nodeId,
      label: input.label,
      kind: input.kind,
      platform: input.platform,
      status: input.status,
      linkedDeviceId: input.linkedDeviceId,
      linkedNodeIds: input.linkedNodeIds,
      agentSurfaces: input.agentSurfaces,
      capabilities: input.capabilities,
      reachability: input.reachability,
      tags: input.tags,
      notes: input.notes,
      lastSeenAt: input.lastSeenAt ?? existing?.lastSeenAt,
      registeredAt: existing?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    this.state.nodes[input.nodeId] = node;
    this.refreshDerivedState();
    this.save();
    return node;
  }

  createCouncilSession(input: CouncilSessionInput): CouncilSession {
    const timestamp = nowIso();
    const session: CouncilSession = {
      id: generateId("council"),
      topic: input.topic,
      prompt: input.prompt,
      requestedBy: input.requestedBy,
      targetMemberIds: input.targetMemberIds,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
      responses: []
    };

    this.state.councilSessions.push(session);
    this.refreshDerivedState();
    this.save();
    return session;
  }

  addCouncilResponse(councilSessionId: string, input: CouncilResponseInput) {
    const session = this.state.councilSessions.find((entry) => entry.id === councilSessionId);
    if (!session) {
      throw new Error(`Unknown council session: ${councilSessionId}`);
    }
    if (session.status !== "open") {
      throw new Error(`Council session ${councilSessionId} is closed.`);
    }

    session.responses.push({
      id: generateId("vote"),
      memberId: input.memberId,
      memberLabel: input.memberLabel,
      stance: input.stance,
      summary: input.summary,
      detail: input.detail,
      submittedAt: nowIso()
    });
    session.updatedAt = nowIso();

    this.refreshDerivedState();
    this.save();
    return session;
  }

  closeCouncilSession(councilSessionId: string): CouncilSession {
    const session = this.state.councilSessions.find((entry) => entry.id === councilSessionId);
    if (!session) {
      throw new Error(`Unknown council session: ${councilSessionId}`);
    }

    const timestamp = nowIso();
    session.status = "closed";
    session.closedAt = timestamp;
    session.updatedAt = timestamp;

    this.refreshDerivedState();
    this.save();
    return session;
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

  getCouncilSessions(): CouncilSession[] {
    return [...this.state.councilSessions].reverse();
  }

  getNodes(): NodeRecord[] {
    return Object.values(this.state.nodes).sort((left, right) => left.label.localeCompare(right.label));
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
