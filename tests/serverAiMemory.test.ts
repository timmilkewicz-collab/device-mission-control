import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { createHubServer } from "../src/hub/server";
import { PeerInboxStore } from "../src/hub/inbox";
import { IntegrityReviewStore } from "../src/hub/integrityReviewStore";
import { MissionControlStore } from "../src/hub/store";

async function withTestServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-ai-memory-"));
  const hub = createHubServer({
    port: 0,
    host: "127.0.0.1",
    store: new MissionControlStore(path.join(tempDir, "hub-state.json")),
    inbox: new PeerInboxStore(path.join(tempDir, "inbox.jsonl")),
    integrityReviews: new IntegrityReviewStore(path.join(tempDir, "integrity-reviews.json"))
  });

  await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
  const address = hub.server.address() as AddressInfo;

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      hub.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("hub exposes read-only ai memory overview", async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/overview`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      defaultLoop: string[];
      roles: Array<{ name: string }>;
      currentState?: { title: string };
    };

    assert.deepEqual(payload.defaultLoop, ["Planner", "Builder", "QA", "Librarian"]);
    assert.ok(payload.roles.some((role) => role.name === "Architecture Reviewer"));
    assert.equal(payload.currentState?.title, "Current State");
  });
});

test("hub lists ai memory records by kind", async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/records?kind=decision`);
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      records: Array<{ title: string; kind: string }>;
    };

    assert.ok(payload.records.some((record) => record.title === "Decision: Agent Roles Memory Spine"));
    assert.ok(payload.records.every((record) => record.kind === "decision"));
  });
});
