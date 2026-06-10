import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_LINUX_NODE_ID,
  CANONICAL_SSH_LINK_ID,
  LEGACY_LINUX_NODE_ID,
  LEGACY_SSH_LINK_ID,
  reconcileGoliathState
} from "../src/hub/reconcileGoliathIdentity";
import { hubStateSchema } from "../src/shared/types";

test("reconcileGoliathState merges legacy proliant-ubuntu into goliathsystem", () => {
  const state = hubStateSchema.parse({
    nodes: {
      [CANONICAL_LINUX_NODE_ID]: {
        nodeId: CANONICAL_LINUX_NODE_ID,
        label: "goliathsystem",
        kind: "machine",
        platform: "linux",
        status: "reachable",
        linkedNodeIds: [],
        agentSurfaces: [],
        capabilities: [],
        reachability: { tailscale: true, ssh: false, localAgent: false, companion: false, notes: [] },
        tags: ["tailscale"],
        notes: [],
        registeredAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      [LEGACY_LINUX_NODE_ID]: {
        nodeId: LEGACY_LINUX_NODE_ID,
        label: "Unverified Linux Host (goliathsystem)",
        kind: "machine",
        platform: "ubuntu",
        status: "partial",
        linkedNodeIds: [],
        agentSurfaces: [],
        capabilities: ["ssh"],
        reachability: { tailscale: false, ssh: true, localAgent: false, companion: false, notes: [] },
        tags: ["identity-unverified"],
        notes: ["legacy"],
        registeredAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    },
    links: {
      [LEGACY_SSH_LINK_ID]: {
        linkId: LEGACY_SSH_LINK_ID,
        sourceNodeId: "dhd-admin",
        targetNodeId: LEGACY_LINUX_NODE_ID,
        transport: "ssh",
        status: "blocked",
        label: "legacy ssh",
        notes: [],
        registeredAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    },
    devices: {
      [LEGACY_LINUX_NODE_ID]: {
        deviceId: LEGACY_LINUX_NODE_ID,
        displayName: "ProLiant Ubuntu Server",
        hostName: "goliathsystem",
        platform: "linux",
        capabilities: ["tasks"],
        permissions: {
          observe: true,
          suggest: true,
          taskExecution: "approval",
          shell: false,
          desktopControl: false
        },
        taskCatalog: [],
        tags: ["server"],
        registeredAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z"
      }
    },
    observations: [
      {
        id: "obs_legacy",
        deviceId: LEGACY_LINUX_NODE_ID,
        capturedAt: "2026-01-01T00:00:00.000Z",
        summary: "old obs",
        services: [],
        processes: [],
        notes: [],
        taskCatalog: []
      }
    ]
  });

  const reconciled = reconcileGoliathState(state);
  assert.ok(reconciled.nodes[CANONICAL_LINUX_NODE_ID]);
  assert.equal(reconciled.nodes[LEGACY_LINUX_NODE_ID], undefined);
  assert.equal(reconciled.devices[CANONICAL_LINUX_NODE_ID]?.deviceId, CANONICAL_LINUX_NODE_ID);
  assert.equal(reconciled.observations[0]?.deviceId, CANONICAL_LINUX_NODE_ID);
  assert.equal(reconciled.links[CANONICAL_SSH_LINK_ID]?.targetNodeId, CANONICAL_LINUX_NODE_ID);
});
