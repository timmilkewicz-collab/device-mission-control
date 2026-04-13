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
  try {
    return execFileSync("tailscale", ["ping", "--c", "1", "--timeout", "5s", target], { encoding: "utf8" }).trim();
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error && error.stdout ? String(error.stdout).trim() : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error && error.stderr ? String(error.stderr).trim() : "";
    const combined = [stdout, stderr].filter(Boolean).join("\n").trim();

    if (/^pong from /im.test(combined)) {
      return combined;
    }

    throw error;
  }
}
