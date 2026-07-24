import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadPolicyAdoptionObservation,
  summarizePolicyAdoption
} from "../src/infrastructure/council/policyAdoptionLoader";
import { buildCanonicalStatusSnapshot } from "../src/hub/canonicalStatusExport";
import { hubStateSchema } from "../src/shared/types";

test("loadPolicyAdoptionObservation parses sanitized observation JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-adoption-"));
  const filePath = path.join(tempDir, "observation.json");
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      schema: "mission-control.policy-adoption-observation.v1",
      observedAtUtc: "2026-07-23T12:00:00.000Z",
      producer: "@council/adoption-reporter",
      observations: [
        {
          contextId: "fabric",
          packId: "fabric.agent-context-pack",
          packVersion: "1.0.0",
          contentSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          adoptionStatus: "pending-review",
          distributionReceiptId: "dist-fabric-shadow-001"
        }
      ]
    }),
    "utf8"
  );

  const observation = loadPolicyAdoptionObservation({ filePath });
  assert.ok(observation);
  assert.equal(observation.observations[0]?.adoptionStatus, "pending-review");

  const summary = summarizePolicyAdoption(observation);
  assert.equal(summary.counts["pending-review"], 1);
  assert.equal(summary.counts.current, 0);
});

test("canonical status export surfaces read-only adoption status", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-adoption-export-"));
  const dataDir = path.join(tempDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const statePath = path.join(dataDir, "hub-state.json");
  fs.writeFileSync(statePath, JSON.stringify(hubStateSchema.parse({})), "utf8");

  const adoptionPath = path.join(tempDir, "adoption.json");
  fs.writeFileSync(
    adoptionPath,
    JSON.stringify({
      schema: "mission-control.policy-adoption-observation.v1",
      observedAtUtc: "2026-07-23T12:00:00.000Z",
      observations: [
        {
          contextId: "fabric",
          packId: "fabric.agent-context-pack",
          packVersion: "1.0.0",
          contentSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          adoptionStatus: "drifted"
        }
      ]
    }),
    "utf8"
  );

  const snapshot = buildCanonicalStatusSnapshot({
    cwd: tempDir,
    dataDir,
    hubStatePath: statePath,
    inboxPath: path.join(dataDir, "inbox.jsonl"),
    policyAdoptionPath: adoptionPath
  });

  assert.equal(snapshot.policyAdoption.observations[0]?.adoptionStatus, "drifted");
  assert.equal(snapshot.policyAdoption.counts.drifted, 1);
});
