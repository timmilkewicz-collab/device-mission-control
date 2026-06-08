import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  linkEvidencePackagesToIntegrityAlerts,
  listBase44AppsFromSnapshots,
  listBase44EvidencePackages,
  listBase44IntegrityAlerts
} from "../src/hub/base44Snapshots";

test("base44 snapshot reader groups inventory and latest peeks by app", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "base44-snapshots-"));
  const dataDir = path.join(tempDir, ".mission-control", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(
    path.join(dataDir, "base44-inventory-app-123.json"),
    JSON.stringify(
      {
        checkedAt: "2026-04-17T07:40:00.000Z",
        appId: "app-123",
        apiBase: "https://example.base44.app/api",
        envSources: [".env.tim.local"],
        entities: [
          { entity: "IntegrityAlert", fetched: 2, latestUpdated: "2026-04-17T07:03:09.492000", samples: [{ summary: "access_pattern | escalated" }] },
          { entity: "Course", fetched: 0, samples: [] }
        ]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dataDir, "base44-peek-app-123-IntegrityAlert-old.json"),
    JSON.stringify(
      {
        checkedAt: "2026-04-17T07:41:00.000Z",
        appId: "app-123",
        apiBase: "https://example.base44.app/api",
        entity: "IntegrityAlert",
        fetched: 1,
        records: [{ id: "old-alert", updated_date: "2026-04-17T07:01:00.000Z", preview: { status: "under_review" } }]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dataDir, "base44-peek-app-123-IntegrityAlert-new.json"),
    JSON.stringify(
      {
        checkedAt: "2026-04-17T07:42:00.000Z",
        appId: "app-123",
        apiBase: "https://example.base44.app/api",
        entity: "IntegrityAlert",
        fetched: 2,
        requestedFields: ["status", "signal_summary"],
        records: [{ id: "new-alert", updated_date: "2026-04-17T07:03:09.492000", preview: { status: "escalated" } }]
      },
      null,
      2
    )
  );

  const apps = listBase44AppsFromSnapshots(dataDir);

  assert.equal(apps.length, 1);
  assert.equal(apps[0]?.appId, "app-123");
  assert.equal(apps[0]?.latestInventory?.populatedEntities.length, 1);
  assert.equal(apps[0]?.latestInventory?.populatedEntities[0]?.entity, "IntegrityAlert");
  assert.equal(apps[0]?.latestPeeks.length, 1);
  assert.equal(apps[0]?.latestPeeks[0]?.entity, "IntegrityAlert");
  assert.equal(apps[0]?.latestPeeks[0]?.topRecordId, "new-alert");
  assert.deepEqual(apps[0]?.latestPeeks[0]?.requestedFields, ["status", "signal_summary"]);
  assert.equal(apps[0]?.latestPeeks[0]?.records.length, 1);
});

test("base44 snapshot reader returns empty list when no snapshot directory exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "base44-snapshots-empty-"));
  assert.deepEqual(listBase44AppsFromSnapshots(path.join(tempDir, "missing")), []);
});

test("base44 integrity alert queue flattens latest IntegrityAlert peek records", () => {
  const apps = [
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      envSources: [".env.tim.local"],
      lastSeenAt: "2026-04-17T07:42:00.000Z",
      latestInventory: undefined,
      snapshotCount: 2,
      latestPeeks: [
        {
          snapshotPath: "snap.json",
          checkedAt: "2026-04-17T07:42:00.000Z",
          entity: "IntegrityAlert",
          fetched: 2,
          records: [
            {
              id: "alert-2",
              updated_date: "2026-04-17T07:05:00.000Z",
              preview: {
                alert_type: "financial_anomaly",
                status: "under_review",
                severity: "high",
                signal_summary: "Expense approvals are spiking."
              }
            },
            {
              id: "alert-1",
              updated_date: "2026-04-17T07:10:00.000Z",
              preview: {
                alert_type: "access_pattern",
                status: "escalated",
                severity: "medium",
                signal_summary: "Access sequence changed."
              }
            }
          ],
          topRecordId: "alert-1",
          topRecordUpdated: "2026-04-17T07:10:00.000Z",
          topPreview: {
            alert_type: "access_pattern"
          }
        }
      ]
    }
  ];

  const alerts = listBase44IntegrityAlerts(apps);

  assert.equal(alerts.length, 2);
  assert.equal(alerts[0]?.id, "alert-1");
  assert.equal(alerts[0]?.status, "escalated");
  assert.equal(alerts[1]?.severity, "high");
});

test("base44 snapshot reader keeps filtered and unfiltered peeks separately", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "base44-peek-variants-"));
  const dataDir = path.join(tempDir, ".mission-control", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(
    path.join(dataDir, "base44-peek-app-123-EvidencePackage-all.json"),
    JSON.stringify(
      {
        checkedAt: "2026-04-17T08:00:00.000Z",
        appId: "app-123",
        apiBase: "https://example.base44.app/api",
        entity: "EvidencePackage",
        fetched: 1,
        requestedFields: ["package_id"],
        records: [{ id: "pkg-all", updated_date: "2026-04-17T07:00:00.000Z", preview: { package_id: "EVP-ALL" } }]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dataDir, "base44-peek-app-123-EvidencePackage-filtered.json"),
    JSON.stringify(
      {
        checkedAt: "2026-04-17T08:10:00.000Z",
        appId: "app-123",
        apiBase: "https://example.base44.app/api",
        entity: "EvidencePackage",
        fetched: 0,
        query: { alert_id: "alert-1" },
        requestedFields: ["package_id", "alert_id"],
        records: []
      },
      null,
      2
    )
  );

  const apps = listBase44AppsFromSnapshots(dataDir);

  assert.equal(apps[0]?.latestPeeks.length, 2);
  const evidencePackages = listBase44EvidencePackages(apps);
  assert.equal(evidencePackages.length, 1);
  assert.equal(evidencePackages[0]?.package_id, "EVP-ALL");
});

test("base44 evidence package queue flattens latest EvidencePackage peek records", () => {
  const apps = [
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      envSources: [".env.tim.local"],
      lastSeenAt: "2026-04-17T07:42:00.000Z",
      latestInventory: undefined,
      snapshotCount: 2,
      latestPeeks: [
        {
          snapshotPath: "evidence.json",
          checkedAt: "2026-04-17T07:42:00.000Z",
          entity: "EvidencePackage",
          fetched: 2,
          records: [
            {
              id: "pkg-2",
              updated_date: "2026-04-17T07:05:00.000Z",
              preview: {
                package_id: "EVP-002",
                package_status: "sealed",
                alert_id: "alert-2",
                confidential: true
              }
            },
            {
              id: "pkg-1",
              updated_date: "2026-04-17T07:10:00.000Z",
              preview: {
                package_id: "EVP-001",
                package_status: "active",
                alert_id: "alert-1",
                retention_until: "2027-01-01"
              }
            }
          ],
          topRecordId: "pkg-1",
          topRecordUpdated: "2026-04-17T07:10:00.000Z",
          topPreview: {
            package_id: "EVP-001"
          }
        }
      ]
    }
  ];

  const packages = listBase44EvidencePackages(apps);

  assert.equal(packages.length, 2);
  assert.equal(packages[0]?.package_id, "EVP-001");
  assert.equal(packages[1]?.confidential, "true");
});

test("integrity alerts can be enriched with linked evidence packages", () => {
  const alerts = [
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      snapshotPath: "alerts.json",
      checkedAt: "2026-04-21T23:00:00.000Z",
      id: "alert-1",
      alert_type: "access_pattern",
      status: "escalated",
      severity: "medium",
      signal_summary: "Access sequence changed.",
      preview: {}
    },
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      snapshotPath: "alerts.json",
      checkedAt: "2026-04-21T23:00:00.000Z",
      id: "alert-2",
      alert_type: "financial_anomaly",
      status: "under_review",
      severity: "high",
      signal_summary: "Expense approvals are spiking.",
      preview: {}
    }
  ];

  const evidencePackages = [
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      snapshotPath: "evidence.json",
      checkedAt: "2026-04-21T23:05:00.000Z",
      id: "pkg-1",
      package_id: "EVP-001",
      package_status: "active",
      alert_id: "alert-1",
      confidential: "true",
      preview: {}
    }
  ];

  const enriched = linkEvidencePackagesToIntegrityAlerts(alerts, evidencePackages);

  assert.equal(enriched[0]?.evidencePackageCount, 1);
  assert.equal(enriched[0]?.linkedEvidencePackages?.[0]?.package_id, "EVP-001");
  assert.equal(enriched[1]?.evidencePackageCount, 0);
});

test("evidence packages only link to alerts from the same Base44 app", () => {
  const alerts = [
    {
      appId: "app-123",
      apiBase: "https://example.base44.app/api",
      snapshotPath: "alerts.json",
      checkedAt: "2026-04-21T23:00:00.000Z",
      id: "shared-alert",
      alert_type: "access_pattern",
      status: "escalated",
      severity: "medium",
      signal_summary: "App 123 alert.",
      preview: {}
    },
    {
      appId: "app-456",
      apiBase: "https://other.base44.app/api",
      snapshotPath: "alerts.json",
      checkedAt: "2026-04-21T23:00:00.000Z",
      id: "shared-alert",
      alert_type: "financial_anomaly",
      status: "under_review",
      severity: "high",
      signal_summary: "App 456 alert.",
      preview: {}
    }
  ];

  const evidencePackages = [
    {
      appId: "app-456",
      apiBase: "https://other.base44.app/api",
      snapshotPath: "evidence.json",
      checkedAt: "2026-04-21T23:05:00.000Z",
      id: "pkg-456",
      package_id: "EVP-456",
      package_status: "active",
      alert_id: "shared-alert",
      confidential: "false",
      preview: {}
    }
  ];

  const enriched = linkEvidencePackagesToIntegrityAlerts(alerts, evidencePackages);

  assert.equal(enriched[0]?.evidencePackageCount, 0);
  assert.equal(enriched[0]?.linkedEvidencePackages?.length, 0);
  assert.equal(enriched[1]?.evidencePackageCount, 1);
  assert.equal(enriched[1]?.linkedEvidencePackages?.[0]?.package_id, "EVP-456");
});
