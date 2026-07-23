import fs from "node:fs";
import path from "node:path";
import { CouncilSession, HubState, TaskRequest, hubStateSchema } from "../../shared/types";

function parseUpdatedAt(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeCouncilSessionsById(
  diskSessions: CouncilSession[],
  memorySessions: CouncilSession[]
): CouncilSession[] {
  const merged = new Map<string, CouncilSession>();
  for (const session of diskSessions) {
    merged.set(session.id, session);
  }
  for (const session of memorySessions) {
    const existing = merged.get(session.id);
    if (!existing || parseUpdatedAt(session.updatedAt) >= parseUpdatedAt(existing.updatedAt)) {
      merged.set(session.id, session);
    }
  }
  return Array.from(merged.values());
}

export function mergeTaskRequestsById(diskTasks: TaskRequest[], memoryTasks: TaskRequest[]): TaskRequest[] {
  const merged = new Map<string, TaskRequest>();
  for (const task of diskTasks) {
    merged.set(task.id, task);
  }
  for (const task of memoryTasks) {
    const existing = merged.get(task.id);
    if (!existing || parseUpdatedAt(task.updatedAt) >= parseUpdatedAt(existing.updatedAt)) {
      merged.set(task.id, task);
    }
  }
  return Array.from(merged.values());
}

export function mergeHubStateForSave(memory: HubState, disk: HubState): HubState {
  return {
    ...memory,
    councilSessions: mergeCouncilSessionsById(disk.councilSessions, memory.councilSessions),
    taskRequests: mergeTaskRequestsById(disk.taskRequests, memory.taskRequests)
  };
}

export class HubStateFile {
  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  getPath(): string {
    return this.filePath;
  }

  load(): HubState {
    if (!fs.existsSync(this.filePath)) {
      return hubStateSchema.parse({});
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return hubStateSchema.parse(JSON.parse(raw));
  }

  getUpdatedAtUtc(): string | undefined {
    if (!fs.existsSync(this.filePath)) {
      return undefined;
    }
    return fs.statSync(this.filePath).mtime.toUTCString();
  }

  save(memory: HubState): HubState {
    const disk = this.exists() ? this.load() : null;
    const merged = disk ? mergeHubStateForSave(memory, disk) : memory;
    const payload = JSON.stringify(merged, null, 2);
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, "utf8");
    fs.renameSync(tempPath, this.filePath);
    return merged;
  }

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }
}
