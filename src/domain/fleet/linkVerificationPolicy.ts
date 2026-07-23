import { LinkRecord, LinkStatus } from "../../shared/types";

export type LinkVerificationProof = {
  verified: boolean;
  online: boolean;
  detail: string;
  target: string;
  checkedAt: string;
  routeQuality?: "direct" | "relay";
};

export const LINK_VERIFICATION_NOTE_PREFIXES = [
  "Verification target ",
  "Route quality ",
  "pong from ",
  "Command failed: tailscale ping ",
  "Peer is offline in current Tailscale status.",
  "No Tailscale target available for verification."
] as const;

export class LinkVerificationPolicy {
  canPromoteToVerified(proof: LinkVerificationProof): boolean {
    return proof.verified && proof.detail.trim().length > 0;
  }

  resolveStatusAfterVerification(currentStatus: LinkStatus, proof: Pick<LinkVerificationProof, "verified" | "online">): LinkStatus {
    if (proof.verified) {
      return "verified";
    }
    if (!proof.online) {
      return "offline";
    }
    return currentStatus;
  }

  buildVerificationNotes(link: LinkRecord, proof: LinkVerificationProof): string[] {
    return Array.from(
      new Set([
        ...link.notes.filter(
          (note) =>
            !LINK_VERIFICATION_NOTE_PREFIXES.some((prefix) => note.startsWith(prefix)) &&
            !note.includes("Command failed: tailscale ping")
        ),
        `Verification target ${proof.target}`,
        proof.routeQuality ? `Route quality ${proof.routeQuality}` : undefined,
        proof.detail
      ].filter((note): note is string => Boolean(note)))
    );
  }
}

export const linkVerificationPolicy = new LinkVerificationPolicy();

export function inferRouteQualityFromPingDetail(detail: string): "direct" | "relay" | undefined {
  if (/via DERP\(/i.test(detail)) {
    return "relay";
  }
  if (/via\s+\d{1,3}(?:\.\d{1,3}){3}:/i.test(detail) || /direct connection established/i.test(detail)) {
    return "direct";
  }
  return undefined;
}
