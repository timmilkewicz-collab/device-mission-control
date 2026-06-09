import path from "node:path";
import {
  listOsirisConnectorSummaries,
  readOsirisSnapshotFile,
  resolveOsirisDataDir,
} from "../hub/osirisSnapshots";

const args = process.argv.slice(2);
const json = args.includes("--json");

const snapshot = readOsirisSnapshotFile(process.cwd());
const summaries = listOsirisConnectorSummaries(process.cwd());

if (json) {
  console.log(
    JSON.stringify(
      {
        snapshotPath: path.join(resolveOsirisDataDir(process.cwd()), "osiris-snapshot.json"),
        generatedAtUtc: snapshot?.generatedAtUtc ?? null,
        connectors: summaries,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log("Osiris Rising snapshot");
console.log(`Path: ${path.join(resolveOsirisDataDir(process.cwd()), "osiris-snapshot.json")}`);
if (!snapshot) {
  console.log("No osiris-snapshot.json found. Run osiris-rising-app/scripts sync:bridges first.");
  process.exit(1);
}

console.log(`Generated (UTC): ${snapshot.generatedAtUtc}`);
for (const connector of summaries) {
  console.log(`- ${connector.connectorId}: ${connector.status} · ${connector.message}`);
}
