import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanSnapshot, evaluateDesktopControlReadiness } from "../src/hub/planner";
import { HubState } from "../src/shared/types";

function buildState(): HubState {
  return {
    nodes: {
      proliant: {
        nodeId: "proliant",
        label: "ProLiant Ubuntu Server",
        kind: "server",
        platform: "ubuntu",
        status: "partial",
        linkedNodeIds: [],
        agentSurfaces: ["tailscale-ssh"],
        capabilities: ["ssh"],
        reachability: {
          tailscale: true,
          ssh: true,
          localAgent: false,
          companion: false,
          notes: []
        },
        tags: ["tailscale"],
        notes: ["Connected but not fully integrated."],
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    links: {
      dellToMain: {
        linkId: "dell-to-main-ssh",
        sourceNodeId: "proliant",
        targetNodeId: "win",
        transport: "ssh",
        status: "attempting",
        label: "ProLiant to Windows over SSH",
        notes: ["setup in progress"],
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    devices: {
      win: {
        deviceId: "win",
        displayName: "Windows Workstation",
        hostName: "win-host",
        platform: "windows",
        tags: ["desktop"],
        capabilities: ["activeWindow", "tasks"],
        permissions: {
          observe: true,
          suggest: true,
          taskExecution: "approval",
          shell: false,
          desktopControl: false
        },
        taskCatalog: [],
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      }
    },
    observations: [
      {
        id: "obs_1",
        deviceId: "win",
        capturedAt: new Date().toISOString(),
        summary: "Focused on VS Code",
        activeWindow: "VS Code",
        workspace: "mission-control",
        screenshots: [],
        services: [],
        processes: [],
        containers: [],
        notes: ["Editing the hub server."],
        taskCatalog: []
      }
    ],
    taskRequests: [],
    councilSessions: [],
    planSnapshots: []
  };
}

test("buildPlanSnapshot summarizes the latest observation", () => {
  const snapshot = buildPlanSnapshot(buildState());

  assert.equal(snapshot.deviceSummaries.length, 1);
  assert.match(snapshot.deviceSummaries[0] ?? "", /Windows Workstation/);
  assert.match(snapshot.notes[0] ?? "", /Editing the hub server/);
  assert.ok(snapshot.silentLoop.some((item) => item.includes("ProLiant Ubuntu Server")));
  assert.ok(snapshot.silentLoop.some((item) => item.includes("ProLiant to Windows over SSH")));
});

test("desktop control readiness stays conservative without history", () => {
  const evaluation = evaluateDesktopControlReadiness(buildState());

  assert.equal(evaluation.recommendation, "not_ready");
  assert.ok(evaluation.reasons.length >= 1);
});
