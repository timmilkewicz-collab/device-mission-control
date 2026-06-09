import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalStatusSnapshot,
  countPeerInboxMessages,
  renderCanonicalStatusMarkdown,
  resolveCanonicalRoot,
  writeCanonicalStatusExport
} from "../src/hub/canonicalStatusExport";
import { hubStateSchema } from "../src/shared/types";

test("resolveCanonicalRoot prefers MISSION_CONTROL_CANONICAL_ROOT when present", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-canonical-"));
  assert.equal(resolveCanonicalRoot({ MISSION_CONTROL_CANONICAL_ROOT: tempDir }), tempDir);
});

test("countPeerInboxMessages counts non-empty jsonl lines", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-inbox-"));
  const inboxPath = path.join(tempDir, "inbox.jsonl");
  fs.writeFileSync(inboxPath, '{"role":"human","text":"hi"}\n\n{"role":"cursor","text":"ok"}\n', "utf8");
  assert.equal(countPeerInboxMessages(inboxPath), 2);
});

test("renderCanonicalStatusMarkdown includes operational truth without secrets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-export-"));
  const dataDir = path.join(tempDir, ".mission-control", "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const state = hubStateSchema.parse({
    nodes: {
      dell: {
        nodeId: "dell",
        label: "Dell 2-in-1",
        kind: "machine",
        platform: "windows",
        status: "active",
        linkedNodeIds: [],
        agentSurfaces: [],
        capabilities: [],
        reachability: {
          tailscale: true,
          ssh: false,
          localAgent: true,
          companion: false,
          notes: []
        },
        tags: [],
        notes: [],
        lastSeenAt: new Date().toISOString(),
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    links: {
      "dell-to-hub": {
        linkId: "dell-to-hub",
        sourceNodeId: "dell",
        targetNodeId: "hub",
        transport: "tailscale",
        status: "verified",
        label: "Dell to hub",
        notes: [],
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    },
    taskRequests: [
      {
        id: "task_1",
        deviceId: "dell",
        taskId: "collect_now",
        arguments: {},
        requestedBy: "operator",
        requestedAt: new Date().toISOString(),
        status: "pending",
        approvalRequired: true,
        updatedAt: new Date().toISOString()
      }
    ]
  });

  fs.writeFileSync(path.join(dataDir, "hub-state.json"), JSON.stringify(state), "utf8");

  const snapshot = buildCanonicalStatusSnapshot({
    cwd: tempDir,
    canonicalRoot: tempDir,
    hubStatePath: path.join(dataDir, "hub-state.json"),
    dataDir,
    tokenPresent: false,
    host: "127.0.0.1"
  });

  const markdown = renderCanonicalStatusMarkdown(snapshot);
  assert.match(markdown, /Mission Control status/);
  assert.match(markdown, /Dell 2-in-1/);
  assert.match(markdown, /collect_now/);
  assert.doesNotMatch(markdown, /MISSION_CONTROL_TOKEN=/);
  assert.doesNotMatch(markdown, /api[_-]?key/i);
});

test("writeCanonicalStatusExport writes reminder and log under CANONICAL root", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-write-"));
  const snapshot = buildCanonicalStatusSnapshot({
    cwd: tempDir,
    canonicalRoot: tempDir,
    hubStatePath: path.join(tempDir, "missing-state.json"),
    dataDir: path.join(tempDir, ".mission-control", "data"),
    tokenPresent: false
  });
  const markdown = renderCanonicalStatusMarkdown(snapshot);
  const result = writeCanonicalStatusExport(snapshot, markdown);

  assert.ok(result.markdownPath);
  assert.ok(result.logPath);
  assert.ok(fs.existsSync(result.markdownPath!));
  assert.ok(fs.existsSync(result.logPath!));
  assert.match(fs.readFileSync(result.markdownPath!, "utf8"), /Mission Control status/);
});
