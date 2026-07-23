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
  TaskResultInput
} from "../shared/types";
import { buildOperationalBrief } from "../application/buildOperationalBrief";
import { appendDomainEvent } from "../infrastructure/events/domainEventLog";
import { councilRepository } from "../infrastructure/persistence/councilRepository";
import { fleetRepository } from "../infrastructure/persistence/fleetRepository";
import {
  HubStateFile,
  mergeCouncilSessionsById,
  mergeHubStateForSave,
  mergeTaskRequestsById
} from "../infrastructure/persistence/hubStateFile";
import { taskRepository } from "../infrastructure/persistence/taskRepository";

export { mergeCouncilSessionsById, mergeHubStateForSave, mergeTaskRequestsById };

export class MissionControlStore {
  private state: HubState;
  private readonly persistence: HubStateFile;

  constructor(filePath: string) {
    this.persistence = new HubStateFile(filePath);
    this.state = this.persistence.load();
    this.refreshDerivedState();
  }

  getState(): HubState {
    return structuredClone(this.state);
  }

  deleteNode(nodeId: string): boolean {
    const removed = fleetRepository.deleteNode(this.state, nodeId);
    if (!removed) {
      return false;
    }
    this.refreshDerivedState();
    this.save();
    return true;
  }

  deleteLink(linkId: string): boolean {
    const removed = fleetRepository.deleteLink(this.state, linkId);
    if (!removed) {
      return false;
    }
    this.refreshDerivedState();
    this.save();
    return true;
  }

  upsertLink(input: LinkUpsertInput): LinkRecord {
    const existing = this.state.links[input.linkId];
    const link = fleetRepository.upsertLink(this.state, input);

    if (input.status === "verified" && existing?.status !== "verified") {
      appendDomainEvent({
        type: "LinkVerificationSucceeded",
        at: link.lastCheckedAt ?? link.updatedAt,
        linkId: link.linkId,
        transport: link.transport,
        target: input.notes.find((note) => note.startsWith("Verification target "))?.replace("Verification target ", "") ?? link.linkId
      });
    }

    this.refreshDerivedState();
    this.save();
    return link;
  }

  registerDevice(input: DeviceRegistration) {
    const device = fleetRepository.registerDevice(this.state, input);
    this.refreshDerivedState();
    this.save();
    return device;
  }

  addObservation(observation: Observation): Observation {
    const saved = fleetRepository.addObservation(this.state, observation);
    appendDomainEvent({
      type: "ObservationReceived",
      at: observation.capturedAt,
      deviceId: observation.deviceId,
      observationId: observation.id
    });
    this.refreshDerivedState();
    this.save();
    return saved;
  }

  upsertNode(input: NodeUpsertInput): NodeRecord {
    const node = fleetRepository.upsertNode(this.state, input);
    this.refreshDerivedState();
    this.save();
    return node;
  }

  createCouncilSession(input: CouncilSessionInput): CouncilSession {
    const session = councilRepository.createSession(this.state, input);
    this.refreshDerivedState();
    this.save();
    return session;
  }

  addCouncilResponse(councilSessionId: string, input: CouncilResponseInput) {
    const session = councilRepository.addResponse(this.state, councilSessionId, input);
    this.refreshDerivedState();
    this.save();
    return session;
  }

  closeCouncilSession(councilSessionId: string): CouncilSession {
    const session = councilRepository.closeSession(this.state, councilSessionId);
    this.refreshDerivedState();
    this.save();
    return session;
  }

  requestTask(input: TaskRequestInput): TaskRequest {
    const taskRequest = taskRepository.requestTask(this.state, input);
    this.refreshDerivedState();
    this.save();
    return taskRequest;
  }

  decideTask(taskRequestId: string, input: TaskDecisionInput): TaskRequest {
    const task = taskRepository.decideTask(this.state, taskRequestId, input);
    appendDomainEvent(
      input.approved
        ? {
            type: "TaskApproved",
            at: task.approvedAt ?? task.updatedAt,
            taskRequestId: task.id,
            deviceId: task.deviceId,
            taskId: task.taskId,
            actor: input.actor
          }
        : {
            type: "TaskRejected",
            at: task.approvedAt ?? task.updatedAt,
            taskRequestId: task.id,
            deviceId: task.deviceId,
            taskId: task.taskId,
            actor: input.actor
          }
    );
    this.refreshDerivedState();
    this.save();
    return task;
  }

  updateTaskResult(taskRequestId: string, input: TaskResultInput): TaskRequest {
    const task = taskRepository.updateTaskResult(this.state, taskRequestId, input);
    this.refreshDerivedState();
    this.save();
    return task;
  }

  getApprovedTasks(deviceId: string): TaskRequest[] {
    return taskRepository.getApprovedTasks(this.state, deviceId);
  }

  getPendingApprovals(): TaskRequest[] {
    return taskRepository.getPendingApprovals(this.state);
  }

  getCouncilSessions(): CouncilSession[] {
    return councilRepository.listSessions(this.state);
  }

  getCouncilSession(sessionId: string): CouncilSession | undefined {
    return councilRepository.getSession(this.state, sessionId);
  }

  getStateFilePath(): string {
    return this.persistence.getPath();
  }

  getStateFileUpdatedAtUtc(): string | undefined {
    return this.persistence.getUpdatedAtUtc();
  }

  getNodes(): NodeRecord[] {
    return fleetRepository.getNodes(this.state);
  }

  getLinks(): LinkRecord[] {
    return fleetRepository.getLinks(this.state);
  }

  getLatestPlan(): PlanSnapshot {
    return this.state.planSnapshots.at(-1) ?? buildOperationalBrief(this.state).plan;
  }

  private refreshDerivedState(): void {
    const brief = buildOperationalBrief(this.state);
    this.state.desktopControlEvaluation = brief.desktopControl;
    this.state.planSnapshots.push(brief.plan);
    this.state.planSnapshots = this.state.planSnapshots.slice(-100);
  }

  private save(): void {
    this.state = this.persistence.save(this.state);
  }
}
