import fs from "node:fs";
import path from "node:path";

export function resolveOsirisDataDir(cwd = process.cwd()): string {
  return path.join(cwd, ".mission-control", "data");
}

export type OsirisConnectorSnapshot = {
  connector?: string;
  status?: string;
  message?: string;
  counts?: Record<string, number>;
  convexStatus?: string;
  kajabiStatus?: string;
  subcollections?: Record<string, unknown[]>;
};

export type OsirisSnapshotFile = {
  generatedAtUtc: string;
  projectId: string;
  connectors: Record<string, OsirisConnectorSnapshot | null>;
};

export function readOsirisSnapshotFile(
  cwd = process.cwd(),
  dataDir?: string,
): OsirisSnapshotFile | null {
  const resolvedDir = dataDir ?? resolveOsirisDataDir(cwd);
  const snapshotPath = path.join(resolvedDir, "osiris-snapshot.json");
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as OsirisSnapshotFile;
}

export function listOsirisConnectorSummaries(
  cwd = process.cwd(),
  dataDir?: string,
): Array<{
  connectorId: string;
  status: string;
  message: string;
  counts: Record<string, number>;
}> {
  const snapshot = readOsirisSnapshotFile(cwd, dataDir);
  if (!snapshot) {
    return [];
  }

  return Object.entries(snapshot.connectors)
    .map(([connectorId, value]) => ({
      connectorId,
      status: value?.status ?? "unknown",
      message: value?.message ?? "",
      counts: value?.counts ?? {},
    }))
    .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
}
