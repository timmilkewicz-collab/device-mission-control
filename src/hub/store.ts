import fs from "node:fs";
import path from "node:path";
import {
  CouncilResponseInput,
  CouncilSession,
  CouncilSessionInput,
  DeviceRegistration,
  HubState,
  LinkRecord,
  LinkUpsertInput,
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
import { buildPlanSnapshot, evaluateDesktopControlReadiness } from "./operationalPlanner";

function parseUpdatedAt(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeCouncilSessionsById(
  diskSessions: CouncilSession[],
  memorySessions: CouncilSession[],
): CouncilSession[] {
  const merged = new Map<string, CouncilSession>();
  for (const session of diskSessions) {
    merged.set(session.id, session);
  }
  for (const session of memorySessions) {
    const existing = merged.get(session.id);
    if (!existing || parseUpdatedAt(session.updatedAt) >= parseUpdatedAt(existing.updatedAt)) {
      merged.set(session.id, session);
    }
  }
  return Array.from(merged.values());
}

export function mergeTaskRequestsById(
  diskTasks: TaskRequest[],
  memoryTasks: TaskRequest[],
): TaskRequest[] {
  const merged = new Map<string, TaskRequest>();
  for (const task of diskTasks) {
    merged.set(task.id, task);
  }
  for (const task of memoryTasks) {
    const existing = merged.get(task.id);
    if (!existing || parseUpdatedAt(task.updatedAt) >= parseUpdatedAt(existing.updatedAt)) {
      merged.set(task.id, task);
    }
  }
  return Array.from(merged.values());
}

export function mergeHubStateForSave(memory: HubState, disk: HubState): HubState {
  return {
    ...memory,
    councilSessions: mergeCouncilSessionsById(disk.councilSessions, memory.councilSessions),
    taskRequests: mergeTaskRequestsById(disk.taskRequests, memory.taskRequests),
  };
}

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

  deleteNode(nodeId: string): boolean {
    if (!(nodeId in this.state.nodes)) {
      return false;
    }

    delete this.state.nodes[nodeId];
    this.refreshDerivedState();
    this.save();
    return true;
  }

  deleteLink(linkId: string): boolean {
    if (!(linkId in this.state.links)) {
      return false;
    }

    delete this.state.links[linkId];
    this.refreshDerivedState();
    this.save();
    return true;
  }

  upsertLink(input: LinkUpsertInput): LinkRecord {
    const timestamp = nowIso();
    const existing = this.state.links[input.linkId];
    const link: LinkRecord = {
      linkId: input.linkId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      transport: input.transport,
      status: input.status,
      label: input.label,
      notes: input.notes,
      lastCheckedAt: input.lastCheckedAt,
      lastSucceededAt: input.lastSucceededAt ?? existing?.lastSucceededAt,
      registeredAt: existing?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    this.state.links[input.linkId] = link;
    this.refreshDerivedState();
    this.save();
    return link;
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

  getCouncilSession(sessionId: string): CouncilSession | undefined {
    return this.state.councilSessions.find((entry) => entry.id === sessionId);
  }

  getStateFilePath(): string {
    return this.filePath;
  }

  getStateFileUpdatedAtUtc(): string | undefined {
    if (!fs.existsSync(this.filePath)) {
      return undefined;
    }
    return fs.statSync(this.filePath).mtime.toUTCString();
  }

  getNodes(): NodeRecord[] {
    return Object.values(this.state.nodes).sort((left, right) => left.label.localeCompare(right.label));
  }

  getLinks(): LinkRecord[] {
    return Object.values(this.state.links).sort((left, right) => left.label.localeCompare(right.label));
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

  private loadDiskState(): HubState | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    return this.load();
  }

  private refreshDerivedState(): void {
    this.state.desktopControlEvaluation = evaluateDesktopControlReadiness(this.state);
    this.state.planSnapshots.push(buildPlanSnapshot(this.state));
    this.state.planSnapshots = this.state.planSnapshots.slice(-100);
  }

  private save(): void {
    const diskState = this.loadDiskState();
    const merged = diskState ? mergeHubStateForSave(this.state, diskState) : this.state;
    const payload = JSON.stringify(merged, null, 2);
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, "utf8");
    fs.renameSync(tempPath, this.filePath);
    this.state = merged;
  }
}
