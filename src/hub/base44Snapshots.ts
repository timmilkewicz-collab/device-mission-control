import fs from "node:fs";
import path from "node:path";

type Base44InventoryEntityRecord = {
  entity: string;
  fetched: number;
  latestUpdated?: string;
  samples?: Array<{
    id?: string;
    updated_date?: string;
    summary?: string;
  }>;
  error?: string;
};

export type Base44PeekRecord = {
  id?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
  preview?: Record<string, unknown>;
};

export type Base44InventorySummary = {
  snapshotPath: string;
  checkedAt: string;
  populatedEntities: Array<{
    entity: string;
    fetched: number;
    latestUpdated?: string;
    topSummary?: string;
    error?: string;
  }>;
  totalEntities: number;
};

export type Base44PeekSummary = {
  snapshotPath: string;
  checkedAt: string;
  entity: string;
  fetched: number;
  query?: Record<string, unknown>;
  requestedFields?: string[];
  records: Base44PeekRecord[];
  topRecordId?: string;
  topRecordUpdated?: string;
  topPreview?: Record<string, unknown>;
};

export type Base44IntegrityAlert = {
  appId: string;
  apiBase: string;
  snapshotPath: string;
  checkedAt: string;
  id?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
  alert_type?: string;
  status?: string;
  severity?: string;
  signal_summary?: string;
  preview: Record<string, unknown>;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  evidencePackageCount?: number;
  linkedEvidencePackages?: Array<{
    id?: string;
    package_id?: string;
    package_status?: string;
    confidential?: string;
  }>;
};

export type Base44EvidencePackage = {
  appId: string;
  apiBase: string;
  snapshotPath: string;
  checkedAt: string;
  id?: string;
  created_date?: string;
  updated_date?: string;
  created_by?: string;
  package_id?: string;
  package_status?: string;
  alert_id?: string;
  retention_until?: string;
  confidential?: string;
  preview: Record<string, unknown>;
};

export type Base44AppSnapshot = {
  appId: string;
  apiBase: string;
  envSources: string[];
  lastSeenAt: string;
  latestInventory?: Base44InventorySummary;
  latestPeeks: Base44PeekSummary[];
  snapshotCount: number;
};

type Base44SnapshotBucket = {
  appId: string;
  apiBase: string;
  envSources: string[];
  lastSeenAt: string;
  latestInventory?: Base44InventorySummary;
  latestPeeksByKey: Map<string, Base44PeekSummary>;
  snapshotCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function readIso(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) {
    return undefined;
  }

  return Number.isNaN(Date.parse(text)) ? undefined : text;
}

function compareIso(left: string | undefined, right: string | undefined): number {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return leftTime - rightTime;
}

function coerceInventoryEntity(value: unknown): Base44InventoryEntityRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entity = readString(value.entity);
  const fetched = typeof value.fetched === "number" ? value.fetched : undefined;
  if (!entity || fetched === undefined) {
    return undefined;
  }

  const samples = Array.isArray(value.samples)
    ? value.samples
        .map((sample) => {
          if (!isRecord(sample)) {
            return undefined;
          }

          return {
            id: readString(sample.id),
            updated_date: readIso(sample.updated_date),
            summary: readString(sample.summary)
          };
        })
        .filter((sample): sample is NonNullable<typeof sample> => Boolean(sample))
    : undefined;

  return {
    entity,
    fetched,
    latestUpdated: readIso(value.latestUpdated),
    samples,
    error: readString(value.error)
  };
}

function coerceInventorySummary(filePath: string, payload: Record<string, unknown>): Base44InventorySummary | undefined {
  const checkedAt = readIso(payload.checkedAt);
  const entities = Array.isArray(payload.entities)
    ? payload.entities.map(coerceInventoryEntity).filter((entry): entry is Base44InventoryEntityRecord => Boolean(entry))
    : [];

  if (!checkedAt) {
    return undefined;
  }

  return {
    snapshotPath: filePath,
    checkedAt,
    totalEntities: entities.length,
    populatedEntities: entities
      .filter((entry) => entry.fetched > 0 || entry.error)
      .map((entry) => ({
        entity: entry.entity,
        fetched: entry.fetched,
        latestUpdated: entry.latestUpdated,
        topSummary: entry.samples?.[0]?.summary,
        error: entry.error
      }))
      .sort((left, right) => right.fetched - left.fetched || left.entity.localeCompare(right.entity))
  };
}

function coercePeekSummary(filePath: string, payload: Record<string, unknown>): Base44PeekSummary | undefined {
  const checkedAt = readIso(payload.checkedAt);
  const entity = readString(payload.entity);
  const fetched = typeof payload.fetched === "number" ? payload.fetched : undefined;

  if (!checkedAt || !entity || fetched === undefined) {
    return undefined;
  }

  const records = Array.isArray(payload.records)
    ? payload.records
        .map((record) => {
          if (!isRecord(record)) {
            return undefined;
          }

          const peekRecord: Base44PeekRecord = {
            id: readString(record.id),
            created_date: readIso(record.created_date),
            updated_date: readIso(record.updated_date),
            created_by: readString(record.created_by),
            preview: isRecord(record.preview) ? record.preview : undefined
          };

          return peekRecord;
        })
        .filter((record): record is Base44PeekRecord => Boolean(record))
    : [];

  const query = isRecord(payload.query) ? payload.query : undefined;
  const requestedFields = readStringArray(payload.requestedFields);

  return {
    snapshotPath: filePath,
    checkedAt,
    entity,
    fetched,
    query,
    requestedFields: requestedFields.length > 0 ? requestedFields : undefined,
    records,
    topRecordId: records[0]?.id,
    topRecordUpdated: records[0]?.updated_date,
    topPreview: records[0]?.preview
  };
}

function buildPeekKey(summary: Base44PeekSummary): string {
  const queryKey = summary.query ? JSON.stringify(summary.query) : "__all__";
  return `${summary.entity}::${queryKey}`;
}

function ensureBucket(buckets: Map<string, Base44SnapshotBucket>, payload: Record<string, unknown>): Base44SnapshotBucket | undefined {
  const appId = readString(payload.appId);
  const apiBase = readString(payload.apiBase);
  const checkedAt = readIso(payload.checkedAt);

  if (!appId || !apiBase || !checkedAt) {
    return undefined;
  }

  const existing = buckets.get(appId);
  if (existing) {
    if (compareIso(existing.lastSeenAt, checkedAt) < 0) {
      existing.lastSeenAt = checkedAt;
    }
    if (existing.envSources.length === 0) {
      existing.envSources = readStringArray(payload.envSources);
    }
    existing.snapshotCount += 1;
    return existing;
  }

  const bucket: Base44SnapshotBucket = {
    appId,
    apiBase,
    envSources: readStringArray(payload.envSources),
    lastSeenAt: checkedAt,
    latestPeeksByKey: new Map<string, Base44PeekSummary>(),
    snapshotCount: 1
  };

  buckets.set(appId, bucket);
  return bucket;
}

export function listBase44AppsFromSnapshots(dataDir: string = path.join(process.cwd(), ".mission-control", "data")): Base44AppSnapshot[] {
  if (!fs.existsSync(dataDir)) {
    return [];
  }

  const buckets = new Map<string, Base44SnapshotBucket>();
  const files = fs
    .readdirSync(dataDir)
    .filter((fileName) => /^base44-(inventory|peek)-.+\.json$/i.test(fileName))
    .sort();

  for (const fileName of files) {
    const filePath = path.join(dataDir, fileName);
    let parsed: unknown;

    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }

    if (!isRecord(parsed)) {
      continue;
    }

    const bucket = ensureBucket(buckets, parsed);
    if (!bucket) {
      continue;
    }

    if (fileName.startsWith("base44-inventory-")) {
      const summary = coerceInventorySummary(filePath, parsed);
      if (summary && (!bucket.latestInventory || compareIso(bucket.latestInventory.checkedAt, summary.checkedAt) < 0)) {
        bucket.latestInventory = summary;
      }
      continue;
    }

    if (fileName.startsWith("base44-peek-")) {
      const summary = coercePeekSummary(filePath, parsed);
      if (!summary) {
        continue;
      }

      const key = buildPeekKey(summary);
      const existing = bucket.latestPeeksByKey.get(key);
      if (!existing || compareIso(existing.checkedAt, summary.checkedAt) < 0) {
        bucket.latestPeeksByKey.set(key, summary);
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      appId: bucket.appId,
      apiBase: bucket.apiBase,
      envSources: bucket.envSources,
      lastSeenAt: bucket.lastSeenAt,
      latestInventory: bucket.latestInventory,
      latestPeeks: Array.from(bucket.latestPeeksByKey.values()).sort(
        (left, right) => compareIso(right.checkedAt, left.checkedAt) || left.entity.localeCompare(right.entity)
      ),
      snapshotCount: bucket.snapshotCount
    }))
    .sort((left, right) => compareIso(right.lastSeenAt, left.lastSeenAt) || left.appId.localeCompare(right.appId));
}

function readPreviewString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function pickLatestPeek(app: Base44AppSnapshot, entity: string): Base44PeekSummary | undefined {
  const exact = app.latestPeeks.filter((entry) => entry.entity === entity);
  if (exact.length === 0) {
    return undefined;
  }

  return exact.find((entry) => !entry.query) ?? exact[0];
}

function severityWeight(value: string | undefined): number {
  switch (value) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function listBase44IntegrityAlerts(apps: Base44AppSnapshot[]): Base44IntegrityAlert[] {
  return apps
    .flatMap((app) => {
      const peek = pickLatestPeek(app, "IntegrityAlert");
      if (!peek) {
        return [];
      }

      return peek.records.map((record) => ({
        appId: app.appId,
        apiBase: app.apiBase,
        snapshotPath: peek.snapshotPath,
        checkedAt: peek.checkedAt,
        id: record.id,
        created_date: record.created_date,
        updated_date: record.updated_date,
        created_by: record.created_by,
        alert_type: readPreviewString(record.preview?.alert_type),
        status: readPreviewString(record.preview?.status),
        severity: readPreviewString(record.preview?.severity),
        signal_summary: readPreviewString(record.preview?.signal_summary),
        preview: record.preview ?? {}
      }));
    })
    .sort((left, right) => {
      const timeOrder = compareIso(right.updated_date ?? right.created_date, left.updated_date ?? left.created_date);
      if (timeOrder !== 0) {
        return timeOrder;
      }

      const severityOrder = severityWeight(right.severity) - severityWeight(left.severity);
      if (severityOrder !== 0) {
        return severityOrder;
      }

      return (left.id ?? "").localeCompare(right.id ?? "");
    });
}

export function listBase44EvidencePackages(apps: Base44AppSnapshot[]): Base44EvidencePackage[] {
  return apps
    .flatMap((app) => {
      const peek = pickLatestPeek(app, "EvidencePackage");
      if (!peek) {
        return [];
      }

      return peek.records.map((record) => ({
        appId: app.appId,
        apiBase: app.apiBase,
        snapshotPath: peek.snapshotPath,
        checkedAt: peek.checkedAt,
        id: record.id,
        created_date: record.created_date,
        updated_date: record.updated_date,
        created_by: record.created_by,
        package_id: readPreviewString(record.preview?.package_id),
        package_status: readPreviewString(record.preview?.package_status),
        alert_id: readPreviewString(record.preview?.alert_id),
        retention_until: readPreviewString(record.preview?.retention_until),
        confidential:
          typeof record.preview?.confidential === "boolean"
            ? String(record.preview.confidential)
            : readPreviewString(record.preview?.confidential),
        preview: record.preview ?? {}
      }));
    })
    .sort((left, right) => {
      const timeOrder = compareIso(right.updated_date ?? right.created_date, left.updated_date ?? left.created_date);
      if (timeOrder !== 0) {
        return timeOrder;
      }

      return (left.package_id ?? left.id ?? "").localeCompare(right.package_id ?? right.id ?? "");
    });
}

function buildEvidenceLinkKey(appId: string | undefined, alertId: string | undefined): string | undefined {
  const normalizedAppId = appId?.trim();
  const normalizedAlertId = alertId?.trim();
  if (!normalizedAppId || !normalizedAlertId) {
    return undefined;
  }

  return `${normalizedAppId}::${normalizedAlertId}`;
}

export function linkEvidencePackagesToIntegrityAlerts(
  alerts: Base44IntegrityAlert[],
  evidencePackages: Base44EvidencePackage[]
): Base44IntegrityAlert[] {
  const packageMap = new Map<string, Base44EvidencePackage[]>();

  for (const pkg of evidencePackages) {
    const alertKey = buildEvidenceLinkKey(pkg.appId, pkg.alert_id);
    if (!alertKey) {
      continue;
    }

    const existing = packageMap.get(alertKey) ?? [];
    existing.push(pkg);
    packageMap.set(alertKey, existing);
  }

  return alerts.map((alert) => {
    const alertKey = buildEvidenceLinkKey(alert.appId, alert.id);
    const matches = alertKey ? packageMap.get(alertKey) ?? [] : [];

    if (matches.length === 0) {
      return {
        ...alert,
        evidencePackageCount: 0,
        linkedEvidencePackages: []
      };
    }

    return {
      ...alert,
      evidencePackageCount: matches.length,
      linkedEvidencePackages: matches.map((pkg) => ({
        id: pkg.id,
        package_id: pkg.package_id,
        package_status: pkg.package_status,
        confidential: pkg.confidential
      }))
    };
  });
}
