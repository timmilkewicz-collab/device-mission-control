import { execFileSync } from "node:child_process";

export type TailscalePeer = {
  HostName: string;
  DNSName: string;
  OS: string;
  Online: boolean;
  TailscaleIPs?: string[];
};

export type TailscaleStatus = {
  Self: TailscalePeer;
  Peer?: Record<string, TailscalePeer>;
};

const knownHostAliases: Record<string, string> = {
  "timothy-s-s25-ultra": "timothys-s25-ultra"
};

export function normalizeNodeId(hostName: string): string {
  const normalized = hostName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return knownHostAliases[normalized] ?? normalized;
}

export function inferKind(os: string): "machine" | "mobile" {
  return os === "android" ? "mobile" : "machine";
}

export function getTailscaleStatus(): TailscaleStatus {
  const raw = execFileSync("tailscale", ["status", "--json"], { encoding: "utf8" });
  return JSON.parse(raw) as TailscaleStatus;
}

export function pingTailscalePeer(target: string): string {
  return execFileSync("tailscale", ["ping", "--c", "1", "--timeout", "5s", target], { encoding: "utf8" }).trim();
}
