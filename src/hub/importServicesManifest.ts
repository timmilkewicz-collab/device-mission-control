import fs from "node:fs";
import path from "node:path";
import { loadMissionControlEnv } from "../shared/env";
import { resolveServicesManifestPath } from "../shared/canonical";
import { resolveDataPath } from "../shared/paths";
import { MissionControlStore } from "./store";

loadMissionControlEnv();
const manifestPath = resolveServicesManifestPath();
const store = new MissionControlStore(resolveDataPath("hub-state.json"));
const now = new Date().toISOString();

type ManifestEntry = {
  vendor: string;
  serviceType: string;
  model: string;
  label: string;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseLine(line: string): ManifestEntry | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  const [vendorService, model, ...labelParts] = trimmed.split(/\s+/);
  if (!vendorService || !model || labelParts.length === 0) {
    return undefined;
  }

  const vendorSplit = vendorService.split("#");
  if (vendorSplit.length !== 2) {
    return undefined;
  }

  const vendor = vendorSplit[0];
  const serviceType = vendorSplit[1];
  if (!vendor || !serviceType) {
    return undefined;
  }
  const label = labelParts.join(" ");

  return {
    vendor,
    serviceType,
    model,
    label
  };
}

function importEntry(entry: ManifestEntry): void {
  const nodeId = `svc-${slugify(entry.vendor)}-${slugify(entry.model)}-${slugify(entry.serviceType)}`;
  const sourceNote = `Imported from ${manifestPath}`;

  store.upsertNode({
    nodeId,
    label: `${entry.label} (${entry.model})`,
    kind: "app",
    platform: "service-manifest",
    status: "discovered",
    linkedNodeIds: [],
    agentSurfaces: ["service-manifest"],
    capabilities: ["registry", "http"],
    reachability: {
      tailscale: false,
      ssh: false,
      localAgent: false,
      companion: false,
      notes: [sourceNote, `Service type ${entry.serviceType}`]
    },
    tags: ["service-manifest", slugify(entry.vendor), slugify(entry.model)],
    notes: [
      `Advertised label ${entry.label}.`,
      `Advertised model ${entry.model}.`,
      `Advertised service ${entry.serviceType}.`,
      sourceNote
    ],
    lastSeenAt: now
  });
}

if (!manifestPath || !fs.existsSync(manifestPath)) {
  throw new Error(
    "Services manifest not found. Set MISSION_CONTROL_SERVICES_MANIFEST_PATH or ensure CANONICAL_ROOT resolves to a tree with 02_PROJECTS/TIM_PRIVATE/.github/services.manifest."
  );
}

const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/);
const entries = lines.map(parseLine).filter((entry): entry is ManifestEntry => Boolean(entry));

for (const entry of entries) {
  importEntry(entry);
}

console.log(`Imported ${entries.length} services from ${path.basename(manifestPath)} into ${resolveDataPath("hub-state.json")}`);
