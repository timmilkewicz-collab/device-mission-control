import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MissionControlStore } from "../src/hub/store";

test("store registers devices and creates approval-gated task requests", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-"));
  const store = new MissionControlStore(path.join(tempDir, "state.json"));

  store.registerDevice({
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
    taskCatalog: [
      {
        id: "capture_screenshot",
        title: "Capture screenshot",
        description: "Capture a screenshot",
        requiresApproval: true,
        platforms: ["windows"]
      }
    ]
  });

  const task = store.requestTask({
    deviceId: "win",
    taskId: "capture_screenshot",
    requestedBy: "user",
    arguments: {}
  });

  assert.equal(task.status, "pending");

  const approved = store.decideTask(task.id, {
    approved: true,
    actor: "user"
  });

  assert.equal(approved.status, "approved");
  assert.equal(store.getApprovedTasks("win").length, 1);
});
