import { resolveDataPath } from "../shared/paths";
import { MissionControlStore } from "./store";
import { getTailscaleStatus, normalizeNodeId, pingTailscalePeer, TailscalePeer } from "./tailscale";

const store = new MissionControlStore(resolveDataPath("hub-state.json"));
const checkedAt = new Date().toISOString();
const status = getTailscaleStatus();
const selfNodeId = normalizeNodeId(status.Self.HostName);
const verificationNotePrefixes = ["Verification target ", "pong from ", "Peer is offline in current Tailscale status.", "No Tailscale target available for verification."];

type VerificationResult = {
  nodeId: string;
  target: string;
  online: boolean;
  verified: boolean;
  detail: string;
};

function verifyPeer(peer: TailscalePeer): VerificationResult {
  const nodeId = normalizeNodeId(peer.HostName);
  const target = peer.TailscaleIPs?.[0] ?? peer.DNSName.replace(/\.$/, "");

  if (!target || !peer.Online) {
    return {
      nodeId,
      target: target ?? peer.HostName,
      online: peer.Online,
      verified: false,
      detail: peer.Online ? "No Tailscale target available for verification." : "Peer is offline in current Tailscale status."
    };
  }

  try {
    const output = pingTailscalePeer(target);
    return {
      nodeId,
      target,
      online: true,
      verified: true,
      detail: output
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      nodeId,
      target,
      online: true,
      verified: false,
      detail: message.trim()
    };
  }
}

const results = Object.values(status.Peer ?? {}).map((peer) => verifyPeer(peer));

for (const result of results) {
  const existingLink = store
    .getLinks()
    .find((link) => link.sourceNodeId === result.nodeId && link.targetNodeId === selfNodeId && link.transport === "tailscale");

  if (!existingLink) {
    continue;
  }

  const notes = Array.from(
    new Set([
      ...existingLink.notes.filter(
        (note) => !verificationNotePrefixes.some((prefix) => note.startsWith(prefix))
      ),
      `Verification target ${result.target}`,
      result.detail
    ])
  );

  store.upsertLink({
    linkId: existingLink.linkId,
    sourceNodeId: existingLink.sourceNodeId,
    targetNodeId: existingLink.targetNodeId,
    transport: existingLink.transport,
    status: result.verified ? "verified" : result.online ? existingLink.status : "offline",
    label: existingLink.label,
    notes,
    lastCheckedAt: checkedAt,
    lastSucceededAt: result.verified ? checkedAt : existingLink.lastSucceededAt
  });
}

for (const result of results) {
  const prefix = result.verified ? "[verified]" : result.online ? "[not verified]" : "[offline]";
  console.log(`${prefix} ${result.nodeId}: ${result.detail}`);
}
