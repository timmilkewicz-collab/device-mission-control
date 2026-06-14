import { loadMissionControlEnv } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import { assertHubNotRunningForDiskWrites } from "./hubLiveGuard";
import { MissionControlStore } from "./store";

async function main(): Promise<void> {
  loadMissionControlEnv();
  await assertHubNotRunningForDiskWrites();

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
    nodeId: "goliathsystem",
    label: "Goliath System",
    kind: "server",
    platform: "linux",
    status: "reachable",
    linkedNodeIds: [],
    agentSurfaces: ["tailscale-ssh"],
    capabilities: ["ssh", "council", "logs"],
    reachability: {
      tailscale: true,
      ssh: true,
      localAgent: false,
      companion: false,
      notes: ["Canonical Tailscale identity for the Linux server lane"]
    },
    tags: ["tailscale", "server", "goliath"],
    notes: [
      "Canonical node id for the Linux server discovered as goliathsystem on Tailscale.",
      "SSH path and hardware role still need explicit human confirmation before production tasks."
    ],
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
    linkId: "dhd-admin-to-goliath-ssh",
    sourceNodeId: "dhd-admin",
    targetNodeId: "goliathsystem",
    transport: "ssh",
    status: "offline",
    label: "DHD-Admin to Goliath System over SSH",
    notes: [
      "SSH probe target defaults to LAN host 192.168.0.174 when configured",
      "Hardware role still needs explicit human confirmation before production tasks"
    ],
    lastCheckedAt: now
  });
}

seedKnownNodes();
seedKnownLinks();

console.log(`Seeded known network topology into ${resolveDataPath("hub-state.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
