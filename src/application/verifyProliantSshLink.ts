import { execFileSync, spawnSync } from "node:child_process";
import { MissionControlStore } from "../hub/store";
import { LinkRecord } from "../shared/types";
import {
  CANONICAL_LINUX_NODE_ID,
  CANONICAL_SSH_LINK_ID,
  LEGACY_SSH_LINK_ID
} from "../domain/fleet/nodeIdentityPolicy";

export type ProliantSshVerifyOptions = {
  host?: string;
  user?: string;
  port?: string;
  keyPath?: string;
  password?: string;
  useTailscaleSsh?: boolean;
};

export type ProliantSshVerifyResult = {
  verified: boolean;
  status: LinkRecord["status"];
  host: string;
  user: string;
  port: string;
  detail: string;
  link: LinkRecord;
};

const successMarker = "mission-control-ssh-ok";

function resolveHost(options: ProliantSshVerifyOptions): string {
  return (
    options.host ??
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_HOST ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_HOST ??
    CANONICAL_LINUX_NODE_ID
  );
}

function resolveUser(options: ProliantSshVerifyOptions): string | undefined {
  return (
    options.user ??
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_USER ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_USER
  );
}

function resolvePort(options: ProliantSshVerifyOptions): string {
  return (
    options.port ??
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PORT ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_PORT ??
    "22"
  );
}

function shouldUseTailscaleSsh(host: string, explicit?: boolean): boolean {
  if (explicit ?? process.env.MISSION_CONTROL_PROLIANT_SSH_USE_TAILSCALE === "1") {
    return true;
  }
  return !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function cleanNotes(notes: string[]): string[] {
  const prefixes = ["SSH host ", "SSH auth ", "SSH verification ", "SSH command ", "SSH transport "];
  return notes.filter((note) => !prefixes.some((prefix) => note.startsWith(prefix)));
}

function findSshLink(store: MissionControlStore): LinkRecord {
  const link =
    store.getLinks().find((entry) => entry.linkId === CANONICAL_SSH_LINK_ID) ??
    store.getLinks().find((entry) => entry.linkId === LEGACY_SSH_LINK_ID);
  if (!link) {
    throw new Error(`Unknown SSH link (${CANONICAL_SSH_LINK_ID} or ${LEGACY_SSH_LINK_ID})`);
  }
  return link;
}

function verifyViaPassword(host: string, port: string, user: string, password: string): string {
  const script = `
import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    hostname=os.environ["MC_HOST"],
    port=int(os.environ["MC_PORT"]),
    username=os.environ["MC_USER"],
    password=os.environ["MC_PASSWORD"],
    timeout=10,
    allow_agent=False,
    look_for_keys=False,
)
stdin, stdout, stderr = client.exec_command("echo ${successMarker}")
output = stdout.read().decode().strip()
err = stderr.read().decode().strip()
client.close()
if err:
    raise SystemExit(err)
print(output)
`;

  return execFileSync("py", ["-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MC_HOST: host,
      MC_PORT: port,
      MC_USER: user,
      MC_PASSWORD: password
    }
  }).trim();
}

function runCommand(command: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000
  });

  return {
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    status: result.status
  };
}

function verifyViaOpenSsh(host: string, port: string, user: string, keyPath?: string): string {
  const args = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=10",
    "-p",
    port
  ];

  if (keyPath) {
    args.push("-i", keyPath);
  }

  args.push(`${user}@${host}`, `echo ${successMarker}`);
  const result = runCommand("ssh", args);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ssh failed");
  }
  return result.stdout;
}

function verifyViaTailscaleSsh(host: string, user: string): string {
  const result = runCommand("tailscale", ["ssh", `${user}@${host}`, "--", `echo ${successMarker}`]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "tailscale ssh failed");
  }
  return result.stdout;
}

export function verifyProliantSshLink(
  store: MissionControlStore,
  options: ProliantSshVerifyOptions = {}
): ProliantSshVerifyResult {
  const host = resolveHost(options);
  const user = resolveUser(options);
  const port = resolvePort(options);
  const keyPath =
    options.keyPath ??
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_KEY_PATH ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_KEY_PATH;
  const password =
    options.password ??
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PASSWORD ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_PASSWORD;
  const checkedAt = new Date().toISOString();
  const link = findSshLink(store);
  const baseNotes = cleanNotes(link.notes);
  const useTailscaleSsh = shouldUseTailscaleSsh(host, options.useTailscaleSsh);
  const transportNote = useTailscaleSsh
    ? "SSH transport via Tailscale SSH (tailnet MagicDNS)."
    : "SSH transport via direct OpenSSH.";

  if (!user) {
    const updated = store.upsertLink({
      linkId: link.linkId === LEGACY_SSH_LINK_ID ? CANONICAL_SSH_LINK_ID : link.linkId,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: CANONICAL_LINUX_NODE_ID,
      transport: link.transport,
      status: "blocked",
      label: "DHD-Admin to Goliath System over SSH",
      notes: [
        ...baseNotes,
        transportNote,
        `SSH verification target is ${host}:${port}.`,
        "SSH auth is still blocked: set MISSION_CONTROL_PROLIANT_SSH_USER to verify a real login path."
      ],
      lastCheckedAt: checkedAt,
      lastSucceededAt: link.lastSucceededAt
    });

    return {
      verified: false,
      status: updated.status,
      host,
      user: "",
      port,
      detail: "SSH user not configured.",
      link: updated
    };
  }

  try {
    const output = password
      ? verifyViaPassword(host, port, user, password)
      : useTailscaleSsh
        ? verifyViaTailscaleSsh(host, user)
        : verifyViaOpenSsh(host, port, user, keyPath);
    const verified = output.includes(successMarker);

    const updated = store.upsertLink({
      linkId: link.linkId === LEGACY_SSH_LINK_ID ? CANONICAL_SSH_LINK_ID : link.linkId,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: CANONICAL_LINUX_NODE_ID,
      transport: link.transport,
      status: verified ? "verified" : "blocked",
      label: "DHD-Admin to Goliath System over SSH",
      notes: [
        ...baseNotes,
        transportNote,
        `SSH host ${host}:${port}.`,
        `SSH command verified against ${host}:${port}.`,
        `SSH auth succeeded for ${user}${password ? " using password-backed verification." : useTailscaleSsh ? " via Tailscale SSH." : "."}`,
        `SSH command output: ${output || "(empty output)"}`,
        "Tailnet path confirmed for goliathsystem; hardware role previously confirmed by operator."
      ],
      lastCheckedAt: checkedAt,
      lastSucceededAt: verified ? checkedAt : link.lastSucceededAt
    });

    return {
      verified,
      status: updated.status,
      host,
      user,
      port,
      detail: output,
      link: updated
    };
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error && error.stderr
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message.trim()
          : String(error).trim();

    const needsTailscaleCheck = /Tailscale SSH requires an additional check/i.test(stderr);
    const timedOut = /ETIMEDOUT|timed out|SIGTERM/i.test(stderr);
    const isOffline = timedOut || /no route to host|connection refused/i.test(stderr);
    const isAuthError = /permission denied|publickey,password|authentication/i.test(stderr);
    const status: LinkRecord["status"] = needsTailscaleCheck
      ? "attempting"
      : isOffline
        ? "offline"
        : isAuthError
          ? "blocked"
          : "attempting";

    const updated = store.upsertLink({
      linkId: link.linkId === LEGACY_SSH_LINK_ID ? CANONICAL_SSH_LINK_ID : link.linkId,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: CANONICAL_LINUX_NODE_ID,
      transport: link.transport,
      status,
      label: "DHD-Admin to Goliath System over SSH",
      notes: [
        ...baseNotes,
        transportNote,
        `SSH verification target is ${host}:${port}.`,
        needsTailscaleCheck
          ? "Tailscale SSH requires one-time browser approval on this operator machine."
          : isAuthError
            ? `SSH auth failed for ${user}.`
            : "SSH verification did not complete.",
        `SSH verification error: ${stderr}`
      ],
      lastCheckedAt: checkedAt,
      lastSucceededAt: link.lastSucceededAt
    });

    return {
      verified: false,
      status: updated.status,
      host,
      user,
      port,
      detail: stderr,
      link: updated
    };
  }
}
