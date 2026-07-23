import test from "node:test";
import assert from "node:assert/strict";
import { taskRequestPolicy } from "../src/domain/tasks/taskRequestPolicy";
import { TaskRequest } from "../src/shared/types";

function buildPendingTask(overrides: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: "task_1",
    deviceId: "win",
    taskId: "capture_screenshot",
    arguments: {},
    requestedBy: "agent",
    requestedAt: new Date().toISOString(),
    status: "pending",
    approvalRequired: true,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("task request policy approves pending approval-gated tasks", () => {
  const task = buildPendingTask();
  assert.equal(taskRequestPolicy.canApprove(task), true);
  assert.equal(taskRequestPolicy.nextStatusAfterDecision(task, { approved: true, actor: "operator" }), "approved");
});

test("task request policy rejects pending tasks", () => {
  const task = buildPendingTask();
  assert.equal(taskRequestPolicy.nextStatusAfterDecision(task, { approved: false, actor: "operator", reason: "Too risky" }), "rejected");
});

test("task request policy blocks decisions on non-pending tasks", () => {
  const task = buildPendingTask({ status: "approved" });
  assert.throws(() => taskRequestPolicy.nextStatusAfterDecision(task, { approved: true, actor: "operator" }), /not pending/);
});

test("task request policy allows execution for approved or auto-approved tasks", () => {
  assert.equal(taskRequestPolicy.canStartExecution(buildPendingTask({ status: "approved" })), true);
  assert.equal(
    taskRequestPolicy.canStartExecution(buildPendingTask({ approvalRequired: false, status: "pending" })),
    true
  );
  assert.equal(taskRequestPolicy.canStartExecution(buildPendingTask()), false);
});
