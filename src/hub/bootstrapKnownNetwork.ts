import { resolveDataPath } from "../shared/paths";
import { MissionControlStore } from "./store";

const store = new MissionControlStore(resolveDataPath("hub-state.json"));
const now = new Date().toISOString();

function seedKnownNodes(): void {
  store.upsertNode({
    nodeId: "dhd-admin",
    label: "DHD-Admin",
    kind: "machine",
    platform: "windows",
    status: "active",
    linkedNodeIds: [],
    agentSurfaces: ["mission-control-agent"],
    capabilities: ["tasks", "council", "registry"],
    reachability: {
      tailscale: true,
      ssh: false,
      localAgent: true,
      companion: false,
      notes: ["This machine", "Tailscale IP 100.95.71.54"]
    },
    tags: ["tailscale", "local"],
    notes: ["Primary local Windows workstation."],
    lastSeenAt: now
  });

  store.upsertNode({
    nodeId: "desktop-hn4p1bs",
    label: "DESKTOP-HN4P1BS",
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
      notes: ["Tailscale IP 100.119.145.61", "Responded to tailscale ping"]
    },
    tags: ["tailscale", "cursor"],
    notes: ["Likely the other active Windows laptop."],
    lastSeenAt: now
  });

  store.upsertNode({
    nodeId: "tim-laptop",
    label: "Tim-Laptop",
    kind: "machine",
    platform: "windows",
    status: "offline",
    linkedNodeIds: [],
    agentSurfaces: ["cursor"],
    capabilities: ["council"],
    reachability: {
      tailscale: true,
      ssh: false,
      localAgent: false,
      companion: false,
      notes: ["Tailscale IP 100.82.61.65", "Seen in tailnet but offline during last check"]
    },
    tags: ["tailscale", "cursor"],
    notes: ["Secondary Windows laptop currently offline."],
    lastSeenAt: now
  });

  store.upsertNode({
    nodeId: "timothys-s25-ultra",
    label: "Timothy's S25 Ultra",
    kind: "mobile",
    platform: "android",
    status: "reachable",
    linkedNodeIds: ["galaxy-watch-8"],
    agentSurfaces: [],
    capabilities: ["companion", "council"],
    reachability: {
      tailscale: true,
      ssh: false,
      localAgent: false,
      companion: true,
      notes: ["Tailscale IP 100.95.0.116", "Responded to tailscale ping"]
    },
    tags: ["tailscale", "mobile"],
    notes: ["Primary phone on the tailnet."],
    lastSeenAt: now
  });

  store.upsertNode({
    nodeId: "galaxy-watch-8",
    label: "Galaxy Watch 8",
    kind: "wearable",
    platform: "wearable",
    status: "partial",
    linkedNodeIds: ["timothys-s25-ultra"],
    agentSurfaces: [],
    capabilities: ["companion"],
    reachability: {
      tailscale: false,
      ssh: false,
      localAgent: false,
      companion: true,
      notes: ["Linked through the S25 rather than directly on the tailnet"]
    },
    tags: ["companion", "wearable"],
    notes: ["Companion device linked through the phone."],
    lastSeenAt: now
  });

  store.upsertNode({
    nodeId: "proliant-ubuntu",
    label: "ProLiant Ubuntu Server",
    kind: "server",
    platform: "ubuntu",
    status: "partial",
    linkedNodeIds: [],
    agentSurfaces: [],
    capabilities: ["ssh", "council", "logs"],
    reachability: {
      tailscale: false,
      ssh: true,
      localAgent: false,
      companion: false,
      notes: ["eno1 identified as 192.168.0.174", "SSH TCP connection accepted during probe"]
    },
    tags: ["server", "ubuntu", "partial"],
    notes: ["Server is on the network but not fully integrated into the hub yet."],
    lastSeenAt: now
  });
}

function seedKnownLinks(): void {
  store.upsertLink({
    linkId: "desktop-hn4p1bs-to-dhd-admin-tailscale",
    sourceNodeId: "desktop-hn4p1bs",
    targetNodeId: "dhd-admin",
    transport: "tailscale",
    status: "reachable",
    label: "DESKTOP-HN4P1BS to DHD-Admin over Tailscale",
    notes: ["Verified by tailscale ping from this machine"],
    lastCheckedAt: now,
    lastSucceededAt: now
  });

  store.upsertLink({
    linkId: "tim-laptop-to-dhd-admin-tailscale",
    sourceNodeId: "tim-laptop",
    targetNodeId: "dhd-admin",
    transport: "tailscale",
    status: "offline",
    label: "Tim-Laptop to DHD-Admin over Tailscale",
    notes: ["Visible in tailnet but offline during last live check"],
    lastCheckedAt: now
  });

  store.upsertLink({
    linkId: "s25-to-dhd-admin-tailscale",
    sourceNodeId: "timothys-s25-ultra",
    targetNodeId: "dhd-admin",
    transport: "tailscale",
    status: "reachable",
    label: "S25 Ultra to DHD-Admin over Tailscale",
    notes: ["Verified by tailscale ping from this machine"],
    lastCheckedAt: now,
    lastSucceededAt: now
  });

  store.upsertLink({
    linkId: "s25-to-watch8-companion",
    sourceNodeId: "timothys-s25-ultra",
    targetNodeId: "galaxy-watch-8",
    transport: "companion",
    status: "reachable",
    label: "S25 Ultra to Galaxy Watch 8 companion link",
    notes: ["Wearable linkage is mediated through the phone"],
    lastCheckedAt: now
  });

  store.upsertLink({
    linkId: "dhd-admin-to-proliant-ssh",
    sourceNodeId: "dhd-admin",
    targetNodeId: "proliant-ubuntu",
    transport: "ssh",
    status: "attempting",
    label: "DHD-Admin to ProLiant Ubuntu over SSH",
    notes: ["SSH TCP probe reached 192.168.0.174", "Still not proven as a full end-to-end management path"],
    lastCheckedAt: now
  });
}

seedKnownNodes();
seedKnownLinks();

console.log(`Seeded known network topology into ${resolveDataPath("hub-state.json")}`);
