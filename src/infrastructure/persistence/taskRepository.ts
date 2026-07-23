import {
  DeviceRecord,
  HubState,
  TaskDecisionInput,
  TaskRequest,
  TaskRequestInput,
  TaskResultInput,
  generateId,
  nowIso
} from "../../shared/types";
import { taskRequestPolicy } from "../../domain/tasks/taskRequestPolicy";

export class TaskRepository {
  requestTask(state: HubState, input: TaskRequestInput): TaskRequest {
    const device = state.devices[input.deviceId];
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

    state.taskRequests.push(taskRequest);
    return taskRequest;
  }

  decideTask(state: HubState, taskRequestId: string, input: TaskDecisionInput): TaskRequest {
    const task = state.taskRequests.find((entry) => entry.id === taskRequestId);
    if (!task) {
      throw new Error(`Unknown task request: ${taskRequestId}`);
    }

    task.status = taskRequestPolicy.nextStatusAfterDecision(task, input);
    task.approvedAt = nowIso();
    task.approvedBy = input.actor;
    task.updatedAt = task.approvedAt;
    task.rejectedReason = input.approved ? undefined : input.reason ?? "Rejected";

    return task;
  }

  updateTaskResult(state: HubState, taskRequestId: string, input: TaskResultInput): TaskRequest {
    const task = state.taskRequests.find((entry) => entry.id === taskRequestId);
    if (!task) {
      throw new Error(`Unknown task request: ${taskRequestId}`);
    }

    task.status = input.status;
    task.updatedAt = nowIso();
    task.resultSummary = input.resultSummary;
    task.resultDetail = input.resultDetail;

    return task;
  }

  getApprovedTasks(state: HubState, deviceId: string): TaskRequest[] {
    return state.taskRequests.filter(
      (task) => task.deviceId === deviceId && (task.status === "approved" || task.status === "executing")
    );
  }

  getPendingApprovals(state: HubState): TaskRequest[] {
    return state.taskRequests.filter((task) => task.status === "pending");
  }

  getDevice(state: HubState, deviceId: string): DeviceRecord | undefined {
    return state.devices[deviceId];
  }
}

export const taskRepository = new TaskRepository();
