import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentRuntime, openPathForPlatform } from "./runtime";
import { baseTaskCatalog } from "./tasks";
import { ProcessSnapshot, ScreenshotSnapshot, ServiceSnapshot, TaskRequest, nowIso } from "../shared/types";
import { loadMissionControlEnv } from "../shared/env";
import { resolveScreenshotDir } from "../shared/paths";

loadMissionControlEnv();

const execFileAsync = promisify(execFile);

async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script
  ]);
  return stdout.trim();
}

async function getActiveWindow(): Promise<string | undefined> {
  try {
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class NativeWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@;
$handle = [NativeWindow]::GetForegroundWindow();
$builder = New-Object System.Text.StringBuilder 1024;
[void][NativeWindow]::GetWindowText($handle, $builder, $builder.Capacity);
$builder.ToString()
`;

    const title = await runPowerShell(script);
    return title || undefined;
  } catch {
    return undefined;
  }
}

async function captureScreenshot(deviceId: string): Promise<ScreenshotSnapshot | undefined> {
  const screenshotDir = resolveScreenshotDir(deviceId);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const filePath = path.join(screenshotDir, `${Date.now()}.png`);

  const script = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type -AssemblyName System.Drawing;
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;
$graphics = [System.Drawing.Graphics]::FromImage($bitmap);
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);
$bitmap.Save("${filePath.replaceAll("\\", "\\\\")}");
$graphics.Dispose();
$bitmap.Dispose();
Write-Output "${filePath.replaceAll("\\", "\\\\")}"
`;

  try {
    const result = await runPowerShell(script);
    return { path: result, capturedAt: nowIso() };
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
    const raw = await runPowerShell(
      "Get-Service | Where-Object {$_.StartType -eq 'Automatic' -and $_.Status -ne 'Running'} | Select-Object -First 5 Name, Status, DisplayName | ConvertTo-Json -Compress"
    );

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as
      | Array<{ Name: string; Status: string | number; DisplayName?: string }>
      | { Name: string; Status: string | number; DisplayName?: string };
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => ({
      name: item.Name,
      status: String(item.Status),
      detail: item.DisplayName
    }));
  } catch {
    return [];
  }
}

async function getProcessSummary(): Promise<ProcessSnapshot[]> {
  try {
    const raw = await runPowerShell(
      "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName, CPU, WorkingSet64 | ConvertTo-Json -Compress"
    );

    if (!raw) {
      return [];
    }

    const parsed =
      (JSON.parse(raw) as Array<{ ProcessName: string; CPU?: number; WorkingSet64?: number }> | { ProcessName: string; CPU?: number; WorkingSet64?: number });
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => ({
      name: item.ProcessName,
      cpu: item.CPU,
      memoryMb: item.WorkingSet64 ? Math.round(item.WorkingSet64 / 1024 / 1024) : undefined
    }));
  } catch {
    return [];
  }
}

function getWorkspaceLabel(): string {
  const workspaceRoot = process.env.MISSION_WORKSPACE_ROOT;
  if (workspaceRoot) {
    return workspaceRoot;
  }
  return `${process.env.USERDOMAIN ?? "local"}\\${process.env.USERNAME ?? os.userInfo().username}`;
}

async function collectObservation(deviceId: string) {
  const [activeWindow, screenshot, services, processes] = await Promise.all([
    getActiveWindow(),
    captureScreenshot(deviceId),
    getServiceSummary(),
    getProcessSummary()
  ]);

  const summaryParts = [
    activeWindow ? `Focused on ${activeWindow}` : "Focused window unavailable",
    services.length > 0 ? `${services.length} automatic services need attention` : "No obvious Windows service issues"
  ];

  return {
    summary: summaryParts.join(" | "),
    activeWindow,
    workspace: getWorkspaceLabel(),
    screenshots: screenshot ? [screenshot] : [],
    services,
    processes,
    containers: [],
    notes: [
      activeWindow ? `Current active window is ${activeWindow}.` : "Could not determine the current active window.",
      services.length > 0
        ? `Some automatic services are not running: ${services.map((service) => service.name).join(", ")}.`
        : "Automatic services look stable."
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
      await openPathForPlatform("windows", os.homedir());
      return { summary: "Opened the home directory in Explorer." };
    }
    case "show_workspace_root": {
      const workspaceRoot = process.env.MISSION_WORKSPACE_ROOT;
      if (!workspaceRoot) {
        throw new Error("MISSION_WORKSPACE_ROOT is not configured.");
      }
      await openPathForPlatform("windows", workspaceRoot);
      return { summary: `Opened ${workspaceRoot}.` };
    }
    default:
      throw new Error(`Unsupported task ${task.taskId}`);
  }
}

const runtime = new AgentRuntime({
  hubUrl: process.env.MISSION_CONTROL_HUB_URL ?? "http://localhost:8787",
  sharedToken: process.env.MISSION_CONTROL_TOKEN,
  deviceId: process.env.MISSION_CONTROL_DEVICE_ID ?? "windows-main",
  displayName: process.env.MISSION_CONTROL_DISPLAY_NAME ?? "Windows Workstation",
  platform: "windows",
  tags: ["desktop", "windows"],
  capabilities: ["activeWindow", "workspace", "screenshot", "services", "processes", "tasks"],
  permissions: {
    observe: true,
    suggest: true,
    taskExecution: "approval",
    shell: false,
    desktopControl: false
  },
  taskCatalog: baseTaskCatalog.filter((task) => task.platforms.includes("windows")),
  observationIntervalMs: Number(process.env.MISSION_CONTROL_INTERVAL_MS ?? 30000),
  collector: () => collectObservation(process.env.MISSION_CONTROL_DEVICE_ID ?? "windows-main"),
  executeTask
});

runtime.start().then(() => {
  console.log("Windows agent started.");
});
