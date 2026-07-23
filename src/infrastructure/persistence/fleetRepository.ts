import {
  DeviceRegistration,
  HubState,
  LinkRecord,
  LinkUpsertInput,
  NodeRecord,
  NodeUpsertInput,
  Observation,
  nowIso
} from "../../shared/types";

export class FleetRepository {
  getNodes(state: HubState): NodeRecord[] {
    return Object.values(state.nodes).sort((left, right) => left.label.localeCompare(right.label));
  }

  getLinks(state: HubState): LinkRecord[] {
    return Object.values(state.links).sort((left, right) => left.label.localeCompare(right.label));
  }

  deleteNode(state: HubState, nodeId: string): boolean {
    if (!(nodeId in state.nodes)) {
      return false;
    }
    delete state.nodes[nodeId];
    return true;
  }

  deleteLink(state: HubState, linkId: string): boolean {
    if (!(linkId in state.links)) {
      return false;
    }
    delete state.links[linkId];
    return true;
  }

  upsertLink(state: HubState, input: LinkUpsertInput): LinkRecord {
    const timestamp = nowIso();
    const existing = state.links[input.linkId];
    const link: LinkRecord = {
      linkId: input.linkId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      transport: input.transport,
      status: input.status,
      label: input.label,
      notes: input.notes,
      lastCheckedAt: input.lastCheckedAt,
      lastSucceededAt: input.lastSucceededAt ?? existing?.lastSucceededAt,
      registeredAt: existing?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    state.links[input.linkId] = link;
    return link;
  }

  registerDevice(state: HubState, input: DeviceRegistration) {
    const timestamp = nowIso();
    const existing = state.devices[input.deviceId];

    state.devices[input.deviceId] = {
      ...input,
      registeredAt: existing?.registeredAt ?? timestamp,
      lastSeenAt: timestamp
    };

    const existingNode = state.nodes[input.deviceId];
    state.nodes[input.deviceId] = {
      nodeId: input.deviceId,
      label: input.displayName,
      kind: input.platform === "windows" ? "machine" : input.tags.includes("server") ? "server" : "machine",
      platform: input.platform,
      status: "active",
      linkedDeviceId: input.deviceId,
      linkedNodeIds: existingNode?.linkedNodeIds ?? [],
      agentSurfaces: Array.from(new Set([...(existingNode?.agentSurfaces ?? []), "mission-control-agent"])),
      capabilities: input.capabilities,
      reachability: existingNode?.reachability ?? {
        tailscale: false,
        ssh: input.platform === "linux",
        localAgent: true,
        companion: false,
        notes: []
      },
      tags: Array.from(new Set(input.tags)),
      notes: existingNode?.notes ?? [],
      lastSeenAt: timestamp,
      registeredAt: existingNode?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    return state.devices[input.deviceId];
  }

  addObservation(state: HubState, observation: Observation): Observation {
    const device = state.devices[observation.deviceId];
    if (device) {
      device.lastSeenAt = observation.capturedAt;
      device.taskCatalog = observation.taskCatalog;
    }

    const node = state.nodes[observation.deviceId];
    if (node) {
      node.lastSeenAt = observation.capturedAt;
      node.updatedAt = nowIso();
      if (node.status === "discovered" || node.status === "reachable" || node.status === "partial") {
        node.status = "active";
      }
    }

    state.observations.push(observation);
    state.observations = state.observations.slice(-250);
    return observation;
  }

  upsertNode(state: HubState, input: NodeUpsertInput): NodeRecord {
    const timestamp = nowIso();
    const existing = state.nodes[input.nodeId];
    const node: NodeRecord = {
      nodeId: input.nodeId,
      label: input.label,
      kind: input.kind,
      platform: input.platform,
      status: input.status,
      linkedDeviceId: input.linkedDeviceId,
      linkedNodeIds: input.linkedNodeIds,
      agentSurfaces: input.agentSurfaces,
      capabilities: input.capabilities,
      reachability: input.reachability,
      tags: input.tags,
      notes: input.notes,
      lastSeenAt: input.lastSeenAt ?? existing?.lastSeenAt,
      registeredAt: existing?.registeredAt ?? timestamp,
      updatedAt: timestamp
    };

    state.nodes[input.nodeId] = node;
    return node;
  }
}

export const fleetRepository = new FleetRepository();
