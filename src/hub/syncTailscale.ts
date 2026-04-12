import { execFileSync } from "node:child_process";
import { resolveDataPath } from "../shared/paths";
import { MissionControlStore } from "./store";

type TailscalePeer = {
  HostName: string;
  DNSName: string;
  OS: string;
  Online: boolean;
  TailscaleIPs?: string[];
};

type TailscaleStatus = {
  Self: TailscalePeer;
  Peer?: Record<string, TailscalePeer>;
};

const store = new MissionControlStore(resolveDataPath("hub-state.json"));
const checkedAt = new Date().toISOString();
const knownHostAliases: Record<string, string> = {
  "timothy-s-s25-ultra": "timothys-s25-ultra"
};

function normalizeNodeId(hostName: string): string {
  const normalized = hostName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return knownHostAliases[normalized] ?? normalized;
}

function inferKind(os: string): "machine" | "mobile" {
  return os === "android" ? "mobile" : "machine";
}

function pruneAlias(aliasNodeId: string, canonicalNodeId: string): void {
  if (aliasNodeId === canonicalNodeId) {
    return;
  }

  for (const link of store.getLinks()) {
    if (link.sourceNodeId === aliasNodeId || link.targetNodeId === aliasNodeId) {
      store.deleteLink(link.linkId);
    }
  }

  store.deleteNode(aliasNodeId);
}

function resolveLinkId(sourceNodeId: string, targetNodeId: string, transport: "tailscale"): string {
  const matches = store
    .getLinks()
    .filter((link) => link.sourceNodeId === sourceNodeId && link.targetNodeId === targetNodeId && link.transport === transport)
    .sort((left, right) => left.linkId.length - right.linkId.length || left.linkId.localeCompare(right.linkId));

  const canonicalLinkId = matches[0]?.linkId ?? `${sourceNodeId}-to-${targetNodeId}-${transport}`;

  for (const duplicate of matches.slice(1)) {
    store.deleteLink(duplicate.linkId);
  }

  return canonicalLinkId;
}

function syncPeer(peer: TailscalePeer, isSelf = false): void {
  const rawNodeId = peer.HostName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const nodeId = normalizeNodeId(peer.HostName);
  pruneAlias(rawNodeId, nodeId);
  const ip = peer.TailscaleIPs?.[0];
  const reachableStatus = peer.Online ? (isSelf ? "active" : "reachable") : "offline";
  const existing = store.getNodes().find((node) => node.nodeId === nodeId);

  store.upsertNode({
    nodeId,
    label: peer.HostName,
    kind: inferKind(peer.OS),
    platform: peer.OS,
    status: existing?.status === "partial" && peer.Online ? "partial" : reachableStatus,
    linkedNodeIds: existing?.linkedNodeIds ?? [],
    linkedDeviceId: existing?.linkedDeviceId,
    agentSurfaces: existing?.agentSurfaces ?? [],
    capabilities: existing?.capabilities ?? [],
    reachability: {
      tailscale: true,
      ssh: existing?.reachability.ssh ?? false,
      localAgent: isSelf || existing?.reachability.localAgent === true,
      companion: existing?.reachability.companion ?? false,
      notes: Array.from(new Set([...(existing?.reachability.notes ?? []), ...(ip ? [`Tailscale IP ${ip}`] : [])]))
    },
    tags: Array.from(new Set([...(existing?.tags ?? []), "tailscale"])),
    notes: existing?.notes ?? [],
    lastSeenAt: checkedAt
  });

  if (!isSelf) {
    const selfNodeId = normalizeNodeId(status.Self.HostName);
    store.upsertLink({
      linkId: resolveLinkId(nodeId, selfNodeId, "tailscale"),
      sourceNodeId: nodeId,
      targetNodeId: selfNodeId,
      transport: "tailscale",
      status: peer.Online ? "reachable" : "offline",
      label: `${peer.HostName} to ${status.Self.HostName} over Tailscale`,
      notes: ip ? [`Last observed Tailscale IP ${ip}`] : [],
      lastCheckedAt: checkedAt,
      lastSucceededAt: peer.Online ? checkedAt : undefined
    });
  }
}

const raw = execFileSync("tailscale", ["status", "--json"], { encoding: "utf8" });
const status = JSON.parse(raw) as TailscaleStatus;

syncPeer(status.Self, true);

for (const peer of Object.values(status.Peer ?? {})) {
  syncPeer(peer);
}

console.log(`Synced Tailscale peers into ${resolveDataPath("hub-state.json")}`);
