import path from "node:path";

export function resolveMissionControlRoot(): string {
  return path.resolve(process.cwd(), ".mission-control");
}

export function resolveDataPath(fileName: string): string {
  return path.join(resolveMissionControlRoot(), "data", fileName);
}

export function resolveScreenshotDir(deviceId: string): string {
  return path.join(resolveMissionControlRoot(), "screenshots", deviceId);
}
