import { TaskDecisionInput, TaskRequest, TaskRequestStatus } from "../../shared/types";

export class TaskRequestPolicy {
  canApprove(task: TaskRequest): boolean {
    return task.status === "pending" && task.approvalRequired;
  }

  canReject(task: TaskRequest): boolean {
    return task.status === "pending";
  }

  canStartExecution(task: TaskRequest): boolean {
    if (task.status === "approved") {
      return true;
    }
    return !task.approvalRequired && task.status === "pending";
  }

  nextStatusAfterDecision(task: TaskRequest, decision: TaskDecisionInput): TaskRequestStatus {
    if (task.status !== "pending") {
      throw new Error(`Task ${task.id} is not pending and cannot be decided.`);
    }
    if (decision.approved && !this.canApprove(task) && task.approvalRequired) {
      throw new Error(`Task ${task.id} cannot be approved in its current state.`);
    }
    return decision.approved ? "approved" : "rejected";
  }
}

export const taskRequestPolicy = new TaskRequestPolicy();
