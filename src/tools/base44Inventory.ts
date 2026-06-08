import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  Base44EntityRecord,
  fingerprintSecret,
  isPlaceholderSecret,
  listBase44Entities,
  loadBase44Config,
  redactSecret
} from "../shared/base44";

type EntitySpec = {
  name: string;
  summaryFields: string[];
};

type EntitySnapshot = {
  entity: string;
  fetched: number;
  latestUpdated?: string;
  samples: Array<{
    id?: string;
    updated_date?: string;
    summary?: string;
  }>;
  error?: string;
};

const DEFAULT_ENTITY_SPECS: EntitySpec[] = [
  { name: "User", summaryFields: ["full_name", "email", "role"] },
  { name: "PilotConfig", summaryFields: ["config_key", "retention_days"] },
  { name: "ChatSession", summaryFields: ["title", "created_by"] },
  { name: "Learning", summaryFields: ["fact"] },
  { name: "Course", summaryFields: ["title", "total_clock_hours"] },
  { name: "Student", summaryFields: ["full_name", "user_email", "status"] },
  { name: "Enrollment", summaryFields: ["student_id", "course_id", "status"] },
  { name: "Assignment", summaryFields: ["title", "module_id"] },
  { name: "Project", summaryFields: ["title", "course_id"] },
  { name: "MaintenanceTask", summaryFields: ["title", "status", "priority"] },
  { name: "Asset", summaryFields: ["asset_tag", "name", "status"] },
  { name: "CameraSystem", summaryFields: ["camera_id", "privacy_level", "status"] },
  { name: "IntegrityAlert", summaryFields: ["alert_type", "status", "signal_summary"] },
  { name: "EvidencePackage", summaryFields: ["package_id", "package_status"] },
  { name: "WhistleblowerTip", summaryFields: ["tip_id", "category", "status"] },
  { name: "TalentInsight", summaryFields: ["employee_name", "employee_email"] }
];

function parseEntitySpecs(): EntitySpec[] {
  const raw = process.env.BASE44_ENTITIES?.trim();
  if (!raw) {
    return DEFAULT_ENTITY_SPECS;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((name) => ({ name, summaryFields: [] }));
}

function stringifyValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? undefined : `${value.length} item(s)`;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0 ? undefined : `${Object.keys(value).length} field(s)`;
  }

  const text = String(value).trim();
  return text.length === 0 ? undefined : text;
}

function summarizeRecord(record: Base44EntityRecord, fields: string[]): string | undefined {
  const pieces = fields
    .map((field) => stringifyValue(record[field]))
    .filter((value): value is string => Boolean(value));

  if (pieces.length > 0) {
    return pieces.join(" | ");
  }

  const fallbackFields = ["title", "name", "full_name", "email", "config_key", "alert_type", "status"];
  const fallback = fallbackFields
    .map((field) => stringifyValue(record[field]))
    .filter((value): value is string => Boolean(value));

  return fallback.length > 0 ? fallback.join(" | ") : undefined;
}

function buildSnapshotPath(cwd: string, appId: string): string {
  const targetDir = path.join(cwd, ".mission-control", "data");
  mkdirSync(targetDir, { recursive: true });
  return path.join(targetDir, `base44-inventory-${appId}.json`);
}

async function snapshotEntity(spec: EntitySpec): Promise<EntitySnapshot> {
  const config = loadBase44Config(process.cwd());
  try {
    const records = await listBase44Entities(config, spec.name, {
      limit: Number(process.env.BASE44_LIMIT ?? "3"),
      sortBy: process.env.BASE44_SORT_BY ?? "-updated_date"
    });

    return {
      entity: spec.name,
      fetched: records.length,
      latestUpdated: records[0]?.updated_date,
      samples: records.map((record) => ({
        id: typeof record.id === "string" ? record.id : undefined,
        updated_date: typeof record.updated_date === "string" ? record.updated_date : undefined,
        summary: summarizeRecord(record, spec.summaryFields)
      }))
    };
  } catch (error) {
    return {
      entity: spec.name,
      fetched: 0,
      samples: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadBase44Config(cwd);

  if (isPlaceholderSecret(config.apiKey)) {
    throw new Error("BASE44_API_KEY still looks like a placeholder. Point this run at a real Base44 app key first.");
  }

  const entities = parseEntitySpecs();
  const snapshots = await Promise.all(entities.map((spec) => snapshotEntity(spec)));
  const snapshotPath = buildSnapshotPath(cwd, config.appId);

  const payload = {
    checkedAt: new Date().toISOString(),
    appId: config.appId,
    apiBase: config.apiBase,
    envSources: config.source,
    apiKeyRedacted: redactSecret(config.apiKey),
    apiKeyFingerprint: fingerprintSecret(config.apiKey),
    entities: snapshots
  };

  writeFileSync(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("Base44 inventory");
  console.log(`- appId: ${config.appId}`);
  console.log(`- apiBase: ${config.apiBase}`);
  console.log(`- env sources: ${config.source.join(", ")}`);
  console.log(`- apiKey: ${redactSecret(config.apiKey)}`);
  console.log(`- apiKey fingerprint: ${fingerprintSecret(config.apiKey)}`);
  console.log(`- snapshot: ${snapshotPath}`);

  for (const snapshot of snapshots) {
    if (snapshot.error) {
      console.log(`- ${snapshot.entity}: error | ${snapshot.error}`);
      continue;
    }

    const latest = snapshot.latestUpdated ? ` | latest ${snapshot.latestUpdated}` : "";
    const sample = snapshot.samples[0]?.summary ? ` | ${snapshot.samples[0].summary}` : "";
    console.log(`- ${snapshot.entity}: ${snapshot.fetched} sample(s)${latest}${sample}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
