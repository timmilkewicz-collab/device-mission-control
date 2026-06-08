import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAiMemoryOverview, listAiMemoryRecords, listAiMemoryRecordsByQuery } from "../src/hub/aiMemory";

function writeFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

test("ai memory overview reads current files and record folders", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-"));
  const docsRoot = path.join(tempDir, "docs", "ai");

  writeFile(path.join(docsRoot, "current-state.md"), "# Current State\n\nThe hub is live.\n");
  writeFile(path.join(docsRoot, "project-context.md"), "# Project Context\n\nObserver-first mission control.\n");
  writeFile(
    path.join(docsRoot, "decision-records", "2026-04-29-test.md"),
    "# Decision: Test Path\n\nDate: 2026-04-29\n\nStatus: accepted\n\nUse files as memory.\n"
  );
  writeFile(path.join(docsRoot, "handoffs", "2026-04-29-test.md"), "# Handoff: Test\n\nDate: 2026-04-29\n\nReady.\n");
  writeFile(path.join(docsRoot, "runbooks", "test.md"), "# Runbook: Test\n\nRun the check.\n");

  const overview = getAiMemoryOverview(docsRoot);

  assert.deepEqual(overview.defaultLoop, ["Planner", "Builder", "QA", "Librarian"]);
  assert.equal(overview.currentState?.title, "Current State");
  assert.equal(overview.projectContext?.summary, "Observer-first mission control.");
  assert.equal(overview.records.decision.length, 1);
  assert.equal(overview.records.handoff[0]?.title, "Handoff: Test");
  assert.equal(overview.records.runbook[0]?.summary, "Run the check.");
});

test("ai memory records ignore README files and unknown query kinds", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-records-"));
  const docsRoot = path.join(tempDir, "docs", "ai");

  writeFile(path.join(docsRoot, "decision-records", "README.md"), "# Decision Records\n");
  writeFile(path.join(docsRoot, "decision-records", "2026-04-29-real.md"), "# Decision: Real\n\nUseful.\n");

  assert.equal(listAiMemoryRecords("decision", docsRoot).length, 1);
  assert.deepEqual(listAiMemoryRecordsByQuery("unknown", docsRoot), []);
});
