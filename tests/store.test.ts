import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mergeHubStateForSave, MissionControlStore } from "../src/hub/store";
import { hubStateSchema, nowIso } from "../src/shared/types";

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

test("mergeHubStateForSave keeps disk council sessions when memory omitted them", () => {
  const disk = hubStateSchema.parse({});
  const createdAt = nowIso();
  disk.councilSessions = [
    {
      id: "council-disk",
      topic: "GitHub PR Review - acme/widget#7",
      prompt: "Review this PR",
      status: "open",
      requestedBy: "github-council-bridge",
      targetMemberIds: [],
      responses: [],
      createdAt,
      updatedAt: createdAt
    }
  ];
  const memory = hubStateSchema.parse({});
  memory.nodes = {
    "probe-node": {
      nodeId: "probe-node",
      label: "Probe",
      kind: "machine",
      platform: "linux",
      status: "active",
      linkedNodeIds: [],
      agentSurfaces: [],
      capabilities: [],
      reachability: { tailscale: false, ssh: false, localAgent: false, companion: false, notes: [] },
      tags: [],
      notes: [],
      lastSeenAt: createdAt,
      registeredAt: createdAt,
      updatedAt: createdAt
    }
  };

  const merged = mergeHubStateForSave(memory, disk);
  assert.equal(merged.councilSessions.length, 1);
  assert.equal(merged.councilSessions[0]?.id, "council-disk");
  assert.equal(Object.keys(merged.nodes).length, 1);
});

test("MissionControlStore merge-on-save retains council session written while memory was stale", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-"));
  const statePath = path.join(tempDir, "state.json");
  const staleStore = new MissionControlStore(statePath);
  const createdAt = nowIso();
  const hubWritten = hubStateSchema.parse({
    councilSessions: [
      {
        id: "council-hub",
        topic: "GitHub PR Review - acme/widget#7",
        prompt: "Review this PR",
        status: "open",
        requestedBy: "github-council-bridge",
        targetMemberIds: [],
        responses: [],
        createdAt,
        updatedAt: createdAt
      }
    ]
  });
  fs.writeFileSync(statePath, JSON.stringify(hubWritten, null, 2));

  staleStore.upsertNode({
    nodeId: "probe-node",
    label: "Probe",
    kind: "machine",
    platform: "linux",
    status: "active",
    linkedNodeIds: [],
    agentSurfaces: [],
    capabilities: [],
    reachability: { tailscale: false, ssh: false, localAgent: false, companion: false, notes: [] },
    tags: [],
    notes: []
  });

  const reloaded = hubStateSchema.parse(JSON.parse(fs.readFileSync(statePath, "utf8")));
  assert.equal(reloaded.councilSessions.length, 1);
  assert.equal(reloaded.councilSessions[0]?.id, "council-hub");
  assert.ok(reloaded.nodes["probe-node"]);
});
