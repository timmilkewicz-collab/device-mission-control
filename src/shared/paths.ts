import path from "node:path";

export function resolveMissionControlDataDir(): string {
  const dataDir = process.env.MISSION_CONTROL_DATA_DIR?.trim();
  if (dataDir) {
    return path.resolve(dataDir);
  }
  return path.join(path.resolve(process.cwd(), ".mission-control"), "data");
}

export function resolveMissionControlRoot(): string {
  return path.dirname(resolveMissionControlDataDir());
}

export function resolveDataPath(fileName: string): string {
  return path.join(resolveMissionControlDataDir(), fileName);
}

export function resolveScreenshotDir(deviceId: string): string {
  return path.join(resolveMissionControlRoot(), "screenshots", deviceId);
}
