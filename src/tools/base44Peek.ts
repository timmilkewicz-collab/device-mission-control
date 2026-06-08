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

type PeekRecord = {
  id?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
  preview: Record<string, unknown>;
};

function parseEntityName(): string {
  const candidate = process.argv[2]?.trim() || process.env.BASE44_ENTITY?.trim();

  if (!candidate) {
    throw new Error("Missing entity name. Pass one like `npm run base44:peek -- IntegrityAlert` or set BASE44_ENTITY.");
  }

  return candidate;
}

function parseLimit(): number {
  const raw = process.env.BASE44_LIMIT?.trim();
  if (!raw) {
    return 5;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid BASE44_LIMIT value: ${raw}`);
  }

  return Math.min(Math.floor(parsed), 25);
}

function parseSortBy(): string {
  return process.env.BASE44_SORT_BY?.trim() || "-updated_date";
}

function parseQuery(): Record<string, unknown> | undefined {
  const raw = process.env.BASE44_QUERY?.trim();
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid BASE44_QUERY JSON: ${reason}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("BASE44_QUERY must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function parseFieldList(): string[] | undefined {
  const raw = process.env.BASE44_FIELDS?.trim();
  if (!raw) {
    return undefined;
  }

  const fields = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return fields.length > 0 ? fields : undefined;
}

function summarizeString(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return summarizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const sample = value.slice(0, 3).map((entry) => sanitizeValue(entry));
    return {
      kind: "array",
      length: value.length,
      sample
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    return {
      kind: "object",
      fieldCount: entries.length,
      fields: entries.slice(0, 8).map(([key]) => key)
    };
  }

  return String(value);
}

function selectPreviewFields(record: Base44EntityRecord, requestedFields?: string[]): Record<string, unknown> {
  const keys = requestedFields ?? Object.keys(record).filter((key) => !["id", "created_date", "updated_date", "created_by"].includes(key));
  const preview: Record<string, unknown> = {};

  for (const key of keys) {
    if (!(key in record)) {
      continue;
    }

    const sanitized = sanitizeValue(record[key]);
    if (sanitized === undefined) {
      continue;
    }

    preview[key] = sanitized;

    if (!requestedFields && Object.keys(preview).length >= 8) {
      break;
    }
  }

  return preview;
}

function buildPeekRecord(record: Base44EntityRecord, requestedFields?: string[]): PeekRecord {
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    created_date: typeof record.created_date === "string" ? record.created_date : undefined,
    updated_date: typeof record.updated_date === "string" ? record.updated_date : undefined,
    created_by: typeof record.created_by === "string" ? record.created_by : undefined,
    preview: selectPreviewFields(record, requestedFields)
  };
}

function buildSnapshotPath(cwd: string, appId: string, entityName: string): string {
  const targetDir = path.join(cwd, ".mission-control", "data");
  mkdirSync(targetDir, { recursive: true });
  const safeEntityName = entityName.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return path.join(targetDir, `base44-peek-${appId}-${safeEntityName || "entity"}.json`);
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const config = loadBase44Config(cwd);

  if (isPlaceholderSecret(config.apiKey)) {
    throw new Error("BASE44_API_KEY still looks like a placeholder. Point this run at a real Base44 app key first.");
  }

  const entityName = parseEntityName();
  const limit = parseLimit();
  const sortBy = parseSortBy();
  const query = parseQuery();
  const requestedFields = parseFieldList();

  const records = await listBase44Entities(config, entityName, {
    limit,
    sortBy,
    query
  });

  const previewRecords = records.map((record) => buildPeekRecord(record, requestedFields));
  const snapshotPath = buildSnapshotPath(cwd, config.appId, entityName);

  const payload = {
    checkedAt: new Date().toISOString(),
    appId: config.appId,
    apiBase: config.apiBase,
    envSources: config.source,
    apiKeyRedacted: redactSecret(config.apiKey),
    apiKeyFingerprint: fingerprintSecret(config.apiKey),
    entity: entityName,
    limit,
    sortBy,
    query,
    requestedFields,
    fetched: previewRecords.length,
    records: previewRecords
  };

  writeFileSync(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log("Base44 peek");
  console.log(`- appId: ${config.appId}`);
  console.log(`- apiBase: ${config.apiBase}`);
  console.log(`- entity: ${entityName}`);
  console.log(`- env sources: ${config.source.join(", ")}`);
  console.log(`- apiKey: ${redactSecret(config.apiKey)}`);
  console.log(`- apiKey fingerprint: ${fingerprintSecret(config.apiKey)}`);
  console.log(`- limit: ${limit}`);
  console.log(`- sortBy: ${sortBy}`);

  if (query) {
    console.log(`- query: ${JSON.stringify(query)}`);
  }

  if (requestedFields) {
    console.log(`- fields: ${requestedFields.join(", ")}`);
  }

  console.log(`- fetched: ${previewRecords.length}`);
  console.log(`- snapshot: ${snapshotPath}`);

  previewRecords.forEach((record, index) => {
    const details = {
      id: record.id,
      created_date: record.created_date,
      updated_date: record.updated_date,
      created_by: record.created_by,
      preview: record.preview
    };

    console.log(`- [${index + 1}] ${JSON.stringify(details)}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
