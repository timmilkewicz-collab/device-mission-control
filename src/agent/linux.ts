import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentRuntime, openPathForPlatform } from "./runtime";
import { baseTaskCatalog } from "./tasks";
import { ProcessSnapshot, ScreenshotSnapshot, ServiceSnapshot, TaskRequest, nowIso } from "../shared/types";
import { resolveScreenshotDir } from "../shared/paths";

const execFileAsync = promisify(execFile);

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function runShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync("bash", ["-lc", script]);
  return stdout.trim();
}

async function getActiveWindow(): Promise<string | undefined> {
  try {
    const value = await runShell("if command -v xdotool >/dev/null 2>&1; then xdotool getwindowfocus getwindowname 2>/dev/null; fi");
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function getWorkspaceLabel(): Promise<string | undefined> {
  try {
    const value = await runShell(
      "if command -v wmctrl >/dev/null 2>&1; then wmctrl -d | awk '$2==\"*\" {print $1\":\"$9}'; elif [ -n \"$TMUX\" ]; then tmux display-message -p '#S:#I.#P'; else printf '%s' \"${XDG_CURRENT_DESKTOP:-headless}\"; fi"
    );
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function captureScreenshot(deviceId: string): Promise<ScreenshotSnapshot | undefined> {
  const screenshotDir = resolveScreenshotDir(deviceId);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, `${Date.now()}.png`);

  try {
    await runShell(
      `if command -v gnome-screenshot >/dev/null 2>&1; then gnome-screenshot -f "${filePath}"; elif command -v scrot >/dev/null 2>&1; then scrot "${filePath}"; elif command -v import >/dev/null 2>&1; then import -window root "${filePath}"; else exit 1; fi`
    );
    return { path: filePath, capturedAt: nowIso() };
  } catch (error) {
    return {
      path: filePath,
      capturedAt: nowIso(),
      error: error instanceof Error ? error.message : "Screenshot capture failed"
    };
  }
}

async function getServiceSummary(): Promise<ServiceSnapshot[]> {
  try {
    const raw = await runShell(
      "if command -v systemctl >/dev/null 2>&1; then systemctl list-units --type=service --state=running --no-legend --no-pager | awk 'NR<=5 {print $1\"|running|\"$2}'; fi"
    );
    if (!raw) {
      return [];
    }

    return raw
      .split("\n")
      .map((line) => {
        const [name, status, detail] = line.split("|");
        if (!name || !status) {
          return undefined;
        }
        return {
          name,
          status,
          detail
        };
      })
      .filter(isDefined);
  } catch {
    return [];
  }
}

async function getProcessSummary(): Promise<ProcessSnapshot[]> {
  try {
    const raw = await runShell("ps -eo comm,pcpu,pmem --sort=-pcpu | awk 'NR>1 && NR<=6 {print $1\"|\"$2\"|\"$3}'");
    if (!raw) {
      return [];
    }

    return raw
      .split("\n")
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
      .filter(isDefined);
  } catch {
    return [];
  }
}

async function getContainerSummary(): Promise<string[]> {
  try {
    const raw = await runShell("if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}'; fi");
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function collectObservation(deviceId: string) {
  const [activeWindow, workspace, screenshot, services, processes, containers] = await Promise.all([
    getActiveWindow(),
    getWorkspaceLabel(),
    captureScreenshot(deviceId),
    getServiceSummary(),
    getProcessSummary(),
    getContainerSummary()
  ]);

  const summary = [
    activeWindow ? `Focused on ${activeWindow}` : "No desktop window information available",
    workspace ? `workspace ${workspace}` : "workspace unavailable",
    containers.length > 0 ? `${containers.length} containers running` : "no containers reported"
  ].join(" | ");

  return {
    summary,
    activeWindow,
    workspace: workspace ?? process.env.MISSION_WORKSPACE_ROOT ?? os.hostname(),
    screenshots: screenshot ? [screenshot] : [],
    services,
    processes,
    containers,
    notes: [
      activeWindow ? `Active window: ${activeWindow}.` : "Running in headless or unsupported desktop mode.",
      containers.length > 0 ? `Running containers: ${containers.join(", ")}.` : "No active containers were found."
    ]
  };
}

async function executeTask(task: TaskRequest) {
  switch (task.taskId) {
    case "capture_screenshot": {
      const screenshot = await captureScreenshot(task.deviceId);
      if (!screenshot) {
        throw new Error("Screenshot was not captured.");
      }
      return {
        summary: screenshot.error ? "Screenshot attempted with an error." : "Screenshot captured successfully.",
        detail: screenshot.path
      };
    }
    case "show_home_directory": {
      await openPathForPlatform("linux", os.homedir());
      return { summary: "Opened the home directory." };
    }
    case "show_workspace_root": {
      const workspaceRoot = process.env.MISSION_WORKSPACE_ROOT;
      if (!workspaceRoot) {
        throw new Error("MISSION_WORKSPACE_ROOT is not configured.");
      }
      await openPathForPlatform("linux", workspaceRoot);
      return { summary: `Opened ${workspaceRoot}.` };
    }
    default:
      throw new Error(`Unsupported task ${task.taskId}`);
  }
}

const runtime = new AgentRuntime({
  hubUrl: process.env.MISSION_CONTROL_HUB_URL ?? "http://localhost:8787",
  sharedToken: process.env.MISSION_CONTROL_TOKEN,
  deviceId: process.env.MISSION_CONTROL_DEVICE_ID ?? "linux-home-server",
  displayName: process.env.MISSION_CONTROL_DISPLAY_NAME ?? "Linux Home Server",
  platform: "linux",
  tags: ["linux", "server"],
  capabilities: ["activeWindow", "workspace", "screenshot", "services", "processes", "containers", "tasks"],
  permissions: {
    observe: true,
    suggest: true,
    taskExecution: "approval",
    shell: false,
    desktopControl: false
  },
  taskCatalog: baseTaskCatalog.filter((task) => task.platforms.includes("linux")),
  observationIntervalMs: Number(process.env.MISSION_CONTROL_INTERVAL_MS ?? 30000),
  collector: () => collectObservation(process.env.MISSION_CONTROL_DEVICE_ID ?? "linux-home-server"),
  executeTask
});

runtime.start().then(() => {
  console.log("Linux agent started.");
});
