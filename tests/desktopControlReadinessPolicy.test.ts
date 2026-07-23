import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesktopControlReadinessInput,
  desktopControlReadinessPolicy
} from "../src/domain/tasks/desktopControlReadinessPolicy";
import { DeviceRecord, TaskRequest } from "../src/shared/types";

function buildDevice(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    deviceId: "win",
    displayName: "Windows Workstation",
    hostName: "win-host",
    platform: "windows",
    tags: [],
    capabilities: ["tasks"],
    permissions: {
      observe: true,
      suggest: true,
      taskExecution: "approval",
      shell: false,
      desktopControl: false
    },
    taskCatalog: [],
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides
  };
}

test("desktop control readiness stays conservative without enough history", () => {
  const evaluation = desktopControlReadinessPolicy.evaluate(
    buildDesktopControlReadinessInput({
      nodes: {},
      links: {},
      devices: { win: buildDevice() },
      observations: [{ id: "obs_1", deviceId: "win", capturedAt: new Date().toISOString(), summary: "test", screenshots: [], services: [], processes: [], containers: [], notes: [], taskCatalog: [] }],
      taskRequests: [],
      councilSessions: [],
      planSnapshots: []
    })
  );

  assert.equal(evaluation.recommendation, "not_ready");
  assert.ok(evaluation.reasons.length >= 2);
});

test("desktop control readiness allows pilot when policy thresholds pass", () => {
  const devices = [buildDevice({ deviceId: "win" }), buildDevice({ deviceId: "linux", platform: "linux", displayName: "Linux Server" })];
  const taskRequests: TaskRequest[] = Array.from({ length: 3 }, (_, index) => ({
    id: `task_${index}`,
    deviceId: "win",
    taskId: "capture_screenshot",
    arguments: {},
    requestedBy: "test",
    requestedAt: new Date().toISOString(),
    status: "completed",
    approvalRequired: true,
    updatedAt: new Date().toISOString()
  }));

  const evaluation = desktopControlReadinessPolicy.evaluate({
    devices,
    observationsCount: 6,
    taskRequests
  });

  assert.equal(evaluation.recommendation, "pilot_ready");
  assert.equal(evaluation.reasons.length, 0);
});
