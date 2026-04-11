import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  Capability,
  DeviceRegistration,
  Observation,
  Platform,
  TaskRequest,
  generateId,
  nowIso
} from "../shared/types";

const execFileAsync = promisify(execFile);

type Collector = () => Promise<Omit<Observation, "id" | "deviceId" | "capturedAt" | "taskCatalog">>;
type TaskExecutor = (task: TaskRequest) => Promise<{ summary: string; detail?: string }>;

export type AgentConfig = {
  hubUrl: string;
  sharedToken?: string;
  deviceId: string;
  displayName: string;
  platform: Platform;
  tags: string[];
  capabilities: Capability[];
  permissions: DeviceRegistration["permissions"];
  taskCatalog: DeviceRegistration["taskCatalog"];
  observationIntervalMs: number;
  collector: Collector;
  executeTask: TaskExecutor;
};

async function postJson(url: string, body: unknown, token?: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export class AgentRuntime {
  constructor(private readonly config: AgentConfig) {}

  async start(): Promise<void> {
    await this.register();
    await this.collectAndSend();

    setInterval(() => {
      void this.register();
      void this.collectAndSend();
      void this.pollTasks();
    }, this.config.observationIntervalMs);
  }

  private async register(): Promise<void> {
    const registration: DeviceRegistration = {
      deviceId: this.config.deviceId,
      displayName: this.config.displayName,
      hostName: os.hostname(),
      platform: this.config.platform,
      tags: this.config.tags,
      capabilities: this.config.capabilities,
      permissions: this.config.permissions,
      taskCatalog: this.config.taskCatalog
    };

    await postJson(`${this.config.hubUrl}/api/devices/register`, registration, this.config.sharedToken);
  }

  private async collectAndSend(): Promise<void> {
    const payload = await this.config.collector();
    const observation: Observation = {
      id: generateId("obs"),
      deviceId: this.config.deviceId,
      capturedAt: nowIso(),
      taskCatalog: this.config.taskCatalog,
      ...payload
    };

    await postJson(`${this.config.hubUrl}/api/observations`, observation, this.config.sharedToken);
  }

  private async pollTasks(): Promise<void> {
    const tasks = await getJson<TaskRequest[]>(`${this.config.hubUrl}/api/task-requests?deviceId=${this.config.deviceId}`);

    for (const task of tasks) {
      if (task.status === "executing" || task.status === "completed") {
        continue;
      }

      await postJson(
        `${this.config.hubUrl}/api/task-requests/${task.id}/result`,
        { status: "executing", resultSummary: "Agent accepted task for execution." },
        this.config.sharedToken
      );

      try {
        if (task.taskId === "collect_now") {
          await this.collectAndSend();
          await postJson(
            `${this.config.hubUrl}/api/task-requests/${task.id}/result`,
            { status: "completed", resultSummary: "Fresh observation captured and uploaded." },
            this.config.sharedToken
          );
          continue;
        }

        const result = await this.config.executeTask(task);
        await postJson(
          `${this.config.hubUrl}/api/task-requests/${task.id}/result`,
          { status: "completed", resultSummary: result.summary, resultDetail: result.detail },
          this.config.sharedToken
        );
      } catch (error) {
        await postJson(
          `${this.config.hubUrl}/api/task-requests/${task.id}/result`,
          {
            status: "failed",
            resultSummary: error instanceof Error ? error.message : "Task execution failed"
          },
          this.config.sharedToken
        );
      }
    }
  }
}

export async function openPathForPlatform(platform: Platform, targetPath: string): Promise<void> {
  if (platform === "windows") {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Start-Process explorer.exe "${targetPath}"`]);
    return;
  }

  await execFileAsync("xdg-open", [targetPath]);
}
