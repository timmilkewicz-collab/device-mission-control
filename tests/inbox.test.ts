import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PeerInboxStore } from "../src/hub/inbox";

test("peer inbox appends and lists newest messages first", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-inbox-"));
  const store = new PeerInboxStore(path.join(tempDir, "inbox.jsonl"));

  const first = store.append({
    role: "cursor",
    text: "First message"
  });

  const second = store.append({
    role: "codex",
    text: "Second message"
  });

  const messages = store.list(10);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.id, second.id);
  assert.equal(messages[1]?.id, first.id);
  assert.equal(messages[0]?.role, "codex");
});
