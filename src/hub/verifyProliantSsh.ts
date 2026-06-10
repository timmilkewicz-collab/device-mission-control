import { execFileSync } from "node:child_process";
import { resolveDataPath } from "../shared/paths";
import { MissionControlStore } from "./store";

const store = new MissionControlStore(resolveDataPath("hub-state.json"));
import { CANONICAL_SSH_LINK_ID, LEGACY_SSH_LINK_ID } from "./reconcileGoliathIdentity";

const linkId = CANONICAL_SSH_LINK_ID;
const host = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_HOST ?? process.env.MISSION_CONTROL_PROLIANT_SSH_HOST ?? "192.168.0.174";
const user = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_USER ?? process.env.MISSION_CONTROL_PROLIANT_SSH_USER;
const keyPath = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_KEY_PATH ?? process.env.MISSION_CONTROL_PROLIANT_SSH_KEY_PATH;
const password = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PASSWORD ?? process.env.MISSION_CONTROL_PROLIANT_SSH_PASSWORD;
const port = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PORT ?? process.env.MISSION_CONTROL_PROLIANT_SSH_PORT ?? "22";
const checkedAt = new Date().toISOString();
const successMarker = "mission-control-ssh-ok";

function cleanNotes(notes: string[]): string[] {
  const prefixes = [
    "SSH host ",
    "SSH auth ",
    "SSH verification ",
    "SSH command "
  ];

  return notes.filter((note) => !prefixes.some((prefix) => note.startsWith(prefix)));
}

const link =
  store.getLinks().find((entry) => entry.linkId === linkId) ??
  store.getLinks().find((entry) => entry.linkId === LEGACY_SSH_LINK_ID);
if (!link) {
  throw new Error(`Unknown SSH link (${linkId} or ${LEGACY_SSH_LINK_ID})`);
}

const baseNotes = cleanNotes(link.notes);

if (!user) {
  store.upsertLink({
    ...link,
    status: "blocked",
    notes: [
      ...baseNotes,
      `SSH verification target is ${host}:${port}.`,
      "SSH auth is still blocked: set MISSION_CONTROL_REMOTE_LINUX_SSH_USER or MISSION_CONTROL_PROLIANT_SSH_USER to verify a real login path.",
      "Hardware identity remains unconfirmed until the remote hostname and expected machine role are checked."
    ],
    lastCheckedAt: checkedAt,
    lastSucceededAt: link.lastSucceededAt
  });
  console.log("SSH verification blocked: set MISSION_CONTROL_REMOTE_LINUX_SSH_USER or MISSION_CONTROL_PROLIANT_SSH_USER and rerun.");
  process.exit(0);
}

const args = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "ConnectTimeout=5",
  "-p",
  port
];

if (keyPath) {
  args.push("-i", keyPath);
}

args.push(`${user}@${host}`, `echo ${successMarker}`);

function verifyViaPassword(): string {
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

try {
  const output = password
    ? verifyViaPassword()
    : execFileSync("ssh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const verified = output.includes(successMarker);

  store.upsertLink({
    ...link,
    status: verified ? "verified" : "blocked",
    notes: [
      ...baseNotes,
      `SSH command verified against ${host}:${port}.`,
      `SSH auth succeeded for ${user}${password ? " using password-backed verification." : "."}`,
      `SSH command output: ${output || "(empty output)"}`,
      "Hardware identity still needs explicit human confirmation before labeling this host as the server."
    ],
    lastCheckedAt: checkedAt,
    lastSucceededAt: verified ? checkedAt : link.lastSucceededAt
  });

  console.log(verified ? `[verified] ${user}@${host}: ${output}` : `[blocked] ${user}@${host}: unexpected output`);
} catch (error) {
  const stderr =
    error && typeof error === "object" && "stderr" in error && error.stderr
      ? String(error.stderr).trim()
      : error instanceof Error
        ? error.message.trim()
        : String(error).trim();

  const isOffline = /timed out|no route to host|connection refused/i.test(stderr);
  const isAuthError = /permission denied|publickey,password|authentication/i.test(stderr);

  store.upsertLink({
    ...link,
    status: isOffline ? "offline" : isAuthError ? "blocked" : "attempting",
    notes: [
      ...baseNotes,
      `SSH verification target is ${host}:${port}.`,
      isAuthError ? `SSH auth failed for ${user}.` : "SSH verification did not complete.",
      `SSH verification error: ${stderr}`
    ],
    lastCheckedAt: checkedAt,
    lastSucceededAt: link.lastSucceededAt
  });

  console.log(`${isOffline ? "[offline]" : isAuthError ? "[blocked]" : "[attempting]"} ${user}@${host}: ${stderr}`);
  process.exit(1);
}
