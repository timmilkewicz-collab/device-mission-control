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
  assert.equal(store.getNodes().length, 1);
  assert.equal(store.getNodes()[0]?.linkedDeviceId, "win");
});

test("store can upsert partially integrated nodes before a device agent exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-"));
  const store = new MissionControlStore(path.join(tempDir, "state.json"));

  const node = store.upsertNode({
    nodeId: "proliant-ubuntu",
    label: "ProLiant Ubuntu Server",
    kind: "server",
    platform: "ubuntu",
    status: "partial",
    linkedNodeIds: [],
    agentSurfaces: ["tailscale-ssh"],
    capabilities: ["ssh", "logs"],
    reachability: {
      tailscale: true,
      ssh: true,
      localAgent: false,
      companion: false,
      notes: ["reachable on tailnet"]
    },
    tags: ["tailscale", "partial"],
    notes: ["Connected but not fully integrated yet."]
  });

  assert.equal(node.status, "partial");
  assert.equal(store.getNodes().length, 1);
  assert.equal(store.getNodes()[0]?.nodeId, "proliant-ubuntu");
});

test("store can upsert connection links between nodes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-"));
  const store = new MissionControlStore(path.join(tempDir, "state.json"));

  store.upsertNode({
    nodeId: "dell-2in1",
    label: "Dell 2-in-1",
    kind: "machine",
    platform: "windows",
    status: "reachable",
    linkedNodeIds: [],
    agentSurfaces: ["cursor"],
    capabilities: ["council"],
    reachability: {
      tailscale: true,
      ssh: false,
      localAgent: false,
      companion: false,
      notes: []
    },
    tags: ["tailscale"],
    notes: []
  });

  store.upsertNode({
    nodeId: "windows-main",
    label: "Windows Main",
    kind: "machine",
    platform: "windows",
    status: "partial",
    linkedNodeIds: [],
    agentSurfaces: [],
    capabilities: ["tasks"],
    reachability: {
      tailscale: true,
      ssh: true,
      localAgent: true,
      companion: false,
      notes: []
    },
    tags: ["tailscale"],
    notes: []
  });

  const link = store.upsertLink({
    linkId: "dell-to-main-ssh",
    sourceNodeId: "dell-2in1",
    targetNodeId: "windows-main",
    transport: "ssh",
    status: "attempting",
    label: "Dell 2-in-1 to Windows Main over SSH",
    notes: ["host setup in progress"]
  });

  assert.equal(link.status, "attempting");
  assert.equal(store.getLinks().length, 1);
  assert.equal(store.getLinks()[0]?.transport, "ssh");
});

test("store resolves a single council session by id", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-"));
  const store = new MissionControlStore(path.join(tempDir, "state.json"));

  const session = store.createCouncilSession({
    topic: "Council smoke",
    prompt: "Are we having fun yet?",
    requestedBy: "test-runner",
    targetMemberIds: ["node-a"]
  });

  assert.equal(store.getCouncilSession(session.id)?.id, session.id);
  assert.equal(store.getCouncilSession(session.id)?.responses.length, 0);
  assert.equal(store.getCouncilSession("council-missing"), undefined);
});
