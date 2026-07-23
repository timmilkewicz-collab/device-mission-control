import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalBrief } from "../src/application/buildOperationalBrief";
import { HubState } from "../src/shared/types";

test("buildOperationalBrief returns plan and desktop control evaluation", () => {
  const state: HubState = {
    nodes: {},
    links: {},
    devices: {
      win: {
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
        lastSeenAt: new Date().toISOString()
      }
    },
    observations: [],
    taskRequests: [],
    councilSessions: [],
    planSnapshots: []
  };

  const brief = buildOperationalBrief(state);

  assert.ok(brief.plan.createdAt);
  assert.equal(brief.desktopControl.recommendation, "not_ready");
  assert.equal(brief.plan.deviceSummaries.length, 1);
});
