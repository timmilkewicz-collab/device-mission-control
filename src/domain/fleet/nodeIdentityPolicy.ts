import { HubState, hubStateSchema, nowIso } from "../../shared/types";

export const CANONICAL_LINUX_NODE_ID = "goliathsystem";
export const LEGACY_LINUX_NODE_ID = "proliant-ubuntu";
export const LEGACY_SSH_LINK_ID = "dhd-admin-to-proliant-ssh";
export const CANONICAL_SSH_LINK_ID = "dhd-admin-to-goliath-ssh";

export type NodeIdentityReconciliationResult = {
  state: HubState;
  reconciled: boolean;
  canonicalNodeId?: string;
  legacyNodeId?: string;
};

export class NodeIdentityPolicy {
  reconcileGoliathAliases(state: HubState): NodeIdentityReconciliationResult {
    const next = structuredClone(state);
    const legacyNode = next.nodes[LEGACY_LINUX_NODE_ID];
    const canonicalNode = next.nodes[CANONICAL_LINUX_NODE_ID];
    const timestamp = nowIso();

    if (!legacyNode && !canonicalNode) {
      return { state: next, reconciled: false };
    }

    const mergedNotes = Array.from(
      new Set([
        ...(canonicalNode?.notes ?? []),
        ...(legacyNode?.notes ?? []),
        "Canonical Tailscale identity for the Linux server lane.",
        `Legacy alias ${LEGACY_LINUX_NODE_ID} reconciled on ${timestamp}.`
      ])
    );

    next.nodes[CANONICAL_LINUX_NODE_ID] = {
      nodeId: CANONICAL_LINUX_NODE_ID,
      label: canonicalNode?.label ?? legacyNode?.label ?? "Goliath System",
      kind: "server",
      platform: canonicalNode?.platform ?? legacyNode?.platform ?? "linux",
      status:
        canonicalNode?.status === "reachable" || canonicalNode?.status === "active"
          ? canonicalNode.status
          : legacyNode?.status ?? "reachable",
      linkedDeviceId: canonicalNode?.linkedDeviceId ?? legacyNode?.linkedDeviceId ?? CANONICAL_LINUX_NODE_ID,
      linkedNodeIds: Array.from(new Set([...(canonicalNode?.linkedNodeIds ?? []), ...(legacyNode?.linkedNodeIds ?? [])])),
      agentSurfaces: Array.from(
        new Set([...(canonicalNode?.agentSurfaces ?? []), ...(legacyNode?.agentSurfaces ?? []), "tailscale-ssh"])
      ),
      capabilities: Array.from(
        new Set([...(canonicalNode?.capabilities ?? []), ...(legacyNode?.capabilities ?? []), "ssh", "council", "logs"])
      ),
      reachability: {
        tailscale: true,
        ssh: true,
        localAgent: canonicalNode?.reachability.localAgent ?? legacyNode?.reachability.localAgent ?? false,
        companion: canonicalNode?.reachability.companion ?? legacyNode?.reachability.companion ?? false,
        notes: Array.from(
          new Set([
            ...(canonicalNode?.reachability.notes ?? []),
            ...(legacyNode?.reachability.notes ?? []),
            "Tailscale-verified Linux server identity"
          ])
        )
      },
      tags: Array.from(
        new Set([...(canonicalNode?.tags ?? []), ...(legacyNode?.tags ?? []), "tailscale", "server", "goliath"])
      ),
      notes: mergedNotes,
      lastSeenAt: canonicalNode?.lastSeenAt ?? legacyNode?.lastSeenAt ?? timestamp,
      registeredAt: canonicalNode?.registeredAt ?? legacyNode?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    if (next.devices[LEGACY_LINUX_NODE_ID]) {
      const legacyDevice = next.devices[LEGACY_LINUX_NODE_ID];
      next.devices[CANONICAL_LINUX_NODE_ID] = {
        ...legacyDevice,
        deviceId: CANONICAL_LINUX_NODE_ID,
        displayName: legacyDevice.displayName.includes("goliath")
          ? legacyDevice.displayName
          : "Goliath System (goliathsystem)",
        tags: Array.from(new Set([...legacyDevice.tags, "server", "goliath"])),
        lastSeenAt: legacyDevice.lastSeenAt
      };
      delete next.devices[LEGACY_LINUX_NODE_ID];
    }

    for (const observation of next.observations) {
      if (observation.deviceId === LEGACY_LINUX_NODE_ID) {
        observation.deviceId = CANONICAL_LINUX_NODE_ID;
      }
    }

    for (const task of next.taskRequests) {
      if (task.deviceId === LEGACY_LINUX_NODE_ID) {
        task.deviceId = CANONICAL_LINUX_NODE_ID;
      }
    }

    for (const session of next.councilSessions) {
      session.targetMemberIds = session.targetMemberIds.map((memberId) =>
        memberId === LEGACY_LINUX_NODE_ID ? CANONICAL_LINUX_NODE_ID : memberId
      );
    }

    for (const link of Object.values(next.links)) {
      if (link.sourceNodeId === LEGACY_LINUX_NODE_ID) {
        link.sourceNodeId = CANONICAL_LINUX_NODE_ID;
      }
      if (link.targetNodeId === LEGACY_LINUX_NODE_ID) {
        link.targetNodeId = CANONICAL_LINUX_NODE_ID;
      }
    }

    const legacySshLink = next.links[LEGACY_SSH_LINK_ID];
    if (legacySshLink) {
      next.links[CANONICAL_SSH_LINK_ID] = {
        ...legacySshLink,
        linkId: CANONICAL_SSH_LINK_ID,
        targetNodeId: CANONICAL_LINUX_NODE_ID,
        label: "DHD-Admin to Goliath System over SSH",
        notes: Array.from(
          new Set([
            ...legacySshLink.notes,
            "SSH path now targets canonical goliathsystem node id.",
            "Hardware role still needs explicit human confirmation before production tasks."
          ])
        ),
        updatedAt: timestamp
      };
      delete next.links[LEGACY_SSH_LINK_ID];
    }

    delete next.nodes[LEGACY_LINUX_NODE_ID];

    return {
      state: hubStateSchema.parse(next),
      reconciled: Boolean(legacyNode),
      canonicalNodeId: CANONICAL_LINUX_NODE_ID,
      legacyNodeId: legacyNode ? LEGACY_LINUX_NODE_ID : undefined
    };
  }
}

export const nodeIdentityPolicy = new NodeIdentityPolicy();

export function reconcileGoliathState(state: HubState): HubState {
  return nodeIdentityPolicy.reconcileGoliathAliases(state).state;
}
