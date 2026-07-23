import { loadMissionControlEnv } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import { assertHubNotRunningForDiskWrites } from "./hubLiveGuard";
import { MissionControlStore } from "./store";
import {
  getTailscaleStatus,
  inferRouteQualityFromPingDetail,
  linkVerificationPolicy,
  normalizeNodeId,
  pingTailscalePeer,
  type TailscalePeer
} from "../infrastructure/tailscale";

async function main(): Promise<void> {
  loadMissionControlEnv();
  await assertHubNotRunningForDiskWrites();

  const store = new MissionControlStore(resolveDataPath("hub-state.json"));
  const checkedAt = new Date().toISOString();
  const status = getTailscaleStatus();
  const selfNodeId = normalizeNodeId(status.Self.HostName);

  type VerificationResult = {
    nodeId: string;
    target: string;
    online: boolean;
    verified: boolean;
    detail: string;
    routeQuality?: "direct" | "relay";
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
        detail: output,
        routeQuality: inferRouteQualityFromPingDetail(output)
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

    const proof = {
      verified: result.verified,
      online: result.online,
      detail: result.detail,
      target: result.target,
      checkedAt,
      routeQuality: result.routeQuality
    };

    const status = linkVerificationPolicy.resolveStatusAfterVerification(existingLink.status, proof);
    const notes = linkVerificationPolicy.buildVerificationNotes(existingLink, proof);

    store.upsertLink({
      linkId: existingLink.linkId,
      sourceNodeId: existingLink.sourceNodeId,
      targetNodeId: existingLink.targetNodeId,
      transport: existingLink.transport,
      status,
      label: existingLink.label,
      notes,
      lastCheckedAt: checkedAt,
      lastSucceededAt: result.verified ? checkedAt : existingLink.lastSucceededAt
    });
  }

  for (const result of results) {
    const prefix = result.verified ? "[verified]" : result.online ? "[not verified]" : "[offline]";
    const route = result.routeQuality ? ` (${result.routeQuality})` : "";
    console.log(`${prefix}${route} ${result.nodeId}: ${result.detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
