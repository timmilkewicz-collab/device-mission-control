import { execFileSync, spawnSync } from "node:child_process";
import { baseTaskCatalog } from "../agent/tasks";
import { CANONICAL_LINUX_NODE_ID } from "../domain/fleet/nodeIdentityPolicy";
import { MissionControlStore } from "../hub/store";
import { DeviceRegistration, Observation, ProcessSnapshot, ServiceSnapshot, generateId, nowIso } from "../shared/types";

export type CollectProliantObservationResult = {
  deviceId: string;
  host: string;
  user: string;
  observation: Observation;
};

type RemoteSnapshot = {
  hostName: string;
  kernel: string;
  uptime: string;
  loadAverage: string;
  workspace: string;
  services: ServiceSnapshot[];
  processes: ProcessSnapshot[];
  containers: string[];
  notes: string[];
};

function runRemoteShellViaTailscaleSsh(host: string, user: string, script: string): string {
  const result = spawnSync("tailscale", ["ssh", `${user}@${host}`, "--", "sh", "-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 90_000
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `tailscale command failed: ${script}`).trim());
  }

  return result.stdout.trim();
}

function runRemoteSnapshotViaTailscaleSsh(host: string, user: string): RemoteSnapshot {
  const displayName = resolveDisplayName();
  const script = [
    "printf 'HOST:%s\\n' \"$(hostname)\"",
    "printf 'KERNEL:%s\\n' \"$(uname -sr)\"",
    "printf 'UPTIME:%s\\n' \"$(uptime -p)\"",
    "printf 'LOAD:%s\\n' \"$(cut -d' ' -f1-3 /proc/loadavg)\"",
    "printf 'SERVICES_BEGIN\\n'",
    "systemctl list-units --type=service --state=running --no-legend --no-pager | head -5",
    "printf 'SERVICES_END\\n'",
    "printf 'PROCESSES_BEGIN\\n'",
    "ps -eo comm,pcpu,pmem --sort=-pcpu | head -6 | tail -n +2",
    "printf 'PROCESSES_END\\n'",
    "printf 'CONTAINERS_BEGIN\\n'",
    "docker ps --format '{{.Names}}' 2>/dev/null || true",
    "printf 'CONTAINERS_END\\n'"
  ].join("; ");

  const raw = runRemoteShellViaTailscaleSsh(host, user, script);
  const lines = raw.split("\n");
  const readBlock = (begin: string, end: string) => {
    const start = lines.indexOf(begin);
    const stop = lines.indexOf(end);
    if (start === -1 || stop === -1 || stop <= start) {
      return "";
    }
    return lines.slice(start + 1, stop).join("\n");
  };

  const hostName = lines.find((line) => line.startsWith("HOST:"))?.slice(5) ?? displayName;
  const kernel = lines.find((line) => line.startsWith("KERNEL:"))?.slice(7) ?? "unknown";
  const uptime = lines.find((line) => line.startsWith("UPTIME:"))?.slice(7) ?? "unknown";
  const loadAverage = lines.find((line) => line.startsWith("LOAD:"))?.slice(5) ?? "unknown";
  const serviceLines = readBlock("SERVICES_BEGIN", "SERVICES_END")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return `${parts[0] ?? "unknown"}|running|${parts[1] ?? ""}`;
    })
    .join("\n");
  const processLines = readBlock("PROCESSES_BEGIN", "PROCESSES_END")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return `${parts[0] ?? "unknown"}|${parts[1] ?? "0"}|${parts[2] ?? "0"}`;
    })
    .join("\n");
  const containers = readBlock("CONTAINERS_BEGIN", "CONTAINERS_END");

  return parseRemoteSnapshot(
    JSON.stringify({
      hostName,
      kernel,
      uptime,
      loadAverage,
      workspace: hostName,
      services: serviceLines,
      processes: processLines,
      containers
    }),
    displayName
  );
}

function resolveHost(): string {
  return (
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_HOST ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_HOST ??
    CANONICAL_LINUX_NODE_ID
  );
}

function resolveUser(): string {
  return (
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_USER ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_USER ??
    "macro"
  );
}

function resolvePort(): string {
  return (
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PORT ??
    process.env.MISSION_CONTROL_PROLIANT_SSH_PORT ??
    "22"
  );
}

function resolveDeviceId(): string {
  return (
    process.env.MISSION_CONTROL_REMOTE_LINUX_DEVICE_ID ??
    process.env.MISSION_CONTROL_PROLIANT_DEVICE_ID ??
    CANONICAL_LINUX_NODE_ID
  );
}

function resolveDisplayName(): string {
  return (
    process.env.MISSION_CONTROL_REMOTE_LINUX_DISPLAY_NAME ??
    process.env.MISSION_CONTROL_PROLIANT_DISPLAY_NAME ??
    "Goliath System (goliathsystem)"
  );
}

function shouldUseTailscaleSsh(host: string): boolean {
  if (process.env.MISSION_CONTROL_PROLIANT_SSH_USE_TAILSCALE === "1") {
    return true;
  }
  return !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function parseRemoteSnapshot(raw: string, displayName: string): RemoteSnapshot {
  const parsed = JSON.parse(raw) as Record<string, string | string[] | undefined>;
  const serviceLines = String(parsed.services ?? "")
    .split("\n")
    .filter(Boolean);
  const processLines = String(parsed.processes ?? "")
    .split("\n")
    .filter(Boolean);

  return {
    hostName: String(parsed.hostName ?? displayName),
    kernel: String(parsed.kernel ?? "unknown"),
    uptime: String(parsed.uptime ?? "unknown"),
    loadAverage: String(parsed.loadAverage ?? "unknown"),
    workspace: String(parsed.workspace ?? String(parsed.hostName ?? displayName)),
    services: serviceLines
      .map((line) => {
        const [name, status, detail] = line.split("|");
        if (!name || !status) {
          return undefined;
        }
        return { name, status, detail };
      })
      .filter(isDefined),
    processes: processLines
      .map((line) => {
        const [name, cpu, memory] = line.split("|");
        if (!name || !cpu || !memory) {
          return undefined;
        }
        return {
          name,
          cpu: Number(cpu),
          memoryMb: Math.round(Number(memory) * 10),
          detail: `${memory}% memory`
        };
      })
      .filter(isDefined),
    containers: String(parsed.containers ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : []
  };
}

function runRemoteSnapshotViaPassword(host: string, port: string, user: string, password: string): string {
  const script = `
import json
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

commands = {
    "hostName": "hostname",
    "kernel": "uname -sr",
    "uptime": "uptime -p",
    "loadAverage": "cat /proc/loadavg | cut -d' ' -f1-3",
    "workspace": "hostname",
    "services": "systemctl list-units --type=service --state=running --no-legend --no-pager | head -5 | while read -r name loaded active rest; do printf '%s|running|%s\\\\n' \\"$name\\" \\"$loaded\\"; done",
    "processes": "ps -eo comm,pcpu,pmem --sort=-pcpu | head -6 | tail -n +2 | while read -r name cpu mem; do printf '%s|%s|%s\\\\n' \\"$name\\" \\"$cpu\\" \\"$mem\\"; done",
    "containers": "if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}'; fi"
}

result = {}
for key, command in commands.items():
    stdin, stdout, stderr = client.exec_command(command)
    result[key] = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err:
        result.setdefault("notes", []).append(f"{key} stderr: {err}")

client.close()
print(json.dumps(result))
`;

  return execFileSync("py", ["-c", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MC_HOST: host, MC_PORT: port, MC_USER: user, MC_PASSWORD: password }
  }).trim();
}

function runRemoteSnapshot(host: string, port: string, user: string, password?: string): RemoteSnapshot {
  if (shouldUseTailscaleSsh(host)) {
    return runRemoteSnapshotViaTailscaleSsh(host, user);
  }

  if (!password) {
    throw new Error(
      "MISSION_CONTROL_PROLIANT_SSH_PASSWORD is required for LAN SSH collect, or set MISSION_CONTROL_PROLIANT_SSH_USE_TAILSCALE=1."
    );
  }

  return parseRemoteSnapshot(runRemoteSnapshotViaPassword(host, port, user, password), resolveDisplayName());
}

export function collectProliantObservation(store: MissionControlStore): CollectProliantObservationResult {
  const host = resolveHost();
  const user = resolveUser();
  const port = resolvePort();
  const deviceId = resolveDeviceId();
  const displayName = resolveDisplayName();
  const password =
    process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PASSWORD ?? process.env.MISSION_CONTROL_PROLIANT_SSH_PASSWORD;

  const snapshot = runRemoteSnapshot(host, port, user, password);
  const registration: DeviceRegistration = {
    deviceId,
    displayName,
    hostName: snapshot.hostName,
    platform: "linux",
    tags: ["linux", "remote", "ssh", "server", "goliath"],
    capabilities: ["workspace", "services", "processes", "containers", "tasks", "logs"],
    permissions: {
      observe: true,
      suggest: true,
      taskExecution: "approval",
      shell: false,
      desktopControl: false
    },
    taskCatalog: baseTaskCatalog.filter((task) => task.platforms.includes("linux"))
  };

  store.registerDevice(registration);

  const observation: Observation = {
    id: generateId("obs"),
    deviceId,
    capturedAt: nowIso(),
    summary: `${snapshot.hostName} over SSH | ${snapshot.kernel} | ${snapshot.uptime} | load ${snapshot.loadAverage}`,
    workspace: snapshot.workspace,
    screenshots: [],
    services: snapshot.services,
    processes: snapshot.processes,
    containers: snapshot.containers,
    notes: [
      `Remote SSH observation collected from ${host} as ${user}.`,
      `Kernel: ${snapshot.kernel}.`,
      `Uptime: ${snapshot.uptime}.`,
      snapshot.containers.length > 0 ? `Running containers: ${snapshot.containers.join(", ")}.` : "No active containers were found.",
      ...snapshot.notes
    ],
    taskCatalog: registration.taskCatalog
  };

  store.addObservation(observation);

  return { deviceId, host, user, observation };
}
