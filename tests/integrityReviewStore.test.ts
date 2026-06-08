import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IntegrityReviewStore, buildIntegrityReviewKey } from "../src/hub/integrityReviewStore";

test("integrity review store acknowledges and reloads alerts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-review-"));
  const filePath = path.join(tempDir, "reviews.json");

  const store = new IntegrityReviewStore(filePath);
  const record = store.acknowledge({
    appId: "app-123",
    alertId: "alert-1",
    actor: "dashboard",
    alertType: "access_pattern",
    signalSummary: "Something drifted."
  });

  assert.equal(record.key, buildIntegrityReviewKey("app-123", "alert-1"));
  assert.equal(store.get("app-123", "alert-1")?.actor, "dashboard");

  const reloaded = new IntegrityReviewStore(filePath);
  assert.equal(reloaded.list().length, 1);
  assert.equal(reloaded.get("app-123", "alert-1")?.alertType, "access_pattern");
});
