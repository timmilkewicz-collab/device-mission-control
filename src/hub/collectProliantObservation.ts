import { execFileSync } from "node:child_process";
import { resolveDataPath } from "../shared/paths";
import { DeviceRegistration, generateId, nowIso, Observation, ProcessSnapshot, ServiceSnapshot } from "../shared/types";
import { baseTaskCatalog } from "../agent/tasks";
import { CANONICAL_LINUX_NODE_ID } from "./reconcileGoliathIdentity";
import { MissionControlStore } from "./store";

const store = new MissionControlStore(resolveDataPath("hub-state.json"));

const host = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_HOST ?? process.env.MISSION_CONTROL_PROLIANT_SSH_HOST ?? "192.168.0.174";
const user = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_USER ?? process.env.MISSION_CONTROL_PROLIANT_SSH_USER ?? "macro";
const password = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PASSWORD ?? process.env.MISSION_CONTROL_PROLIANT_SSH_PASSWORD;
const port = process.env.MISSION_CONTROL_REMOTE_LINUX_SSH_PORT ?? process.env.MISSION_CONTROL_PROLIANT_SSH_PORT ?? "22";

const deviceId =
  process.env.MISSION_CONTROL_REMOTE_LINUX_DEVICE_ID ??
  process.env.MISSION_CONTROL_PROLIANT_DEVICE_ID ??
  CANONICAL_LINUX_NODE_ID;
const displayName =
  process.env.MISSION_CONTROL_REMOTE_LINUX_DISPLAY_NAME ??
  process.env.MISSION_CONTROL_PROLIANT_DISPLAY_NAME ??
  "Goliath System (goliathsystem)";

if (!password) {
  throw new Error(
    "MISSION_CONTROL_REMOTE_LINUX_SSH_PASSWORD or MISSION_CONTROL_PROLIANT_SSH_PASSWORD is required for collect:proliant."
  );
}

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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function runRemoteSnapshot(): RemoteSnapshot {
  const script = `
import json
import os
import subprocess
import paramiko

def run(command):
    completed = subprocess.run(command, shell=True, text=True, capture_output=True)
    return completed.stdout.strip()

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

  const raw = execFileSync("py", ["-c", script], {
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

const snapshot = runRemoteSnapshot();

const registration: DeviceRegistration = {
  deviceId,
  displayName,
  hostName: snapshot.hostName,
  platform: "linux",
  tags: ["linux", "remote", "ssh", "identity-unverified"],
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

console.log(`Collected remote observation for ${deviceId} from ${host}`);
