import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeHubExposure, createHubServer, isLoopbackHost } from "../src/hub/server";
import { PeerInboxStore } from "../src/hub/inbox";
import { IntegrityReviewStore } from "../src/hub/integrityReviewStore";
import { MissionControlStore } from "../src/hub/store";
import { deviceRegistrationSchema } from "../src/shared/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("loopback hosts are recognized for open-local mode", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
});

test("hub refuses non-loopback exposure without a token", () => {
  assert.throws(
    () => assertSafeHubExposure("0.0.0.0", undefined),
    /Refusing to start Mission Control/
  );
  assert.doesNotThrow(() => assertSafeHubExposure("0.0.0.0", "token"));
});

test("hub defaults to loopback-safe exposure", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-security-"));

  assert.doesNotThrow(() =>
    createHubServer({
      port: 0,
      store: new MissionControlStore(path.join(tempDir, "hub-state.json")),
      inbox: new PeerInboxStore(path.join(tempDir, "inbox.jsonl")),
      integrityReviews: new IntegrityReviewStore(path.join(tempDir, "integrity-reviews.json"))
    })
  );
});

test("token-protected hub requires auth for agent task polling", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-task-auth-"));
  const store = new MissionControlStore(path.join(tempDir, "hub-state.json"));
  store.registerDevice(
    deviceRegistrationSchema.parse({
      deviceId: "windows-main",
      displayName: "Windows Workstation",
      hostName: "win-host",
      platform: "windows",
      tags: ["desktop"],
      capabilities: ["tasks"],
      permissions: {
        observe: true,
        suggest: true,
        taskExecution: "approval",
        shell: false,
        desktopControl: false
      },
      taskCatalog: [
        {
          id: "collect_now",
          title: "Collect now",
          description: "Collect a fresh observation.",
          requiresApproval: true,
          platforms: ["windows"]
        }
      ]
    })
  );
  const hub = createHubServer({
    port: 0,
    host: "127.0.0.1",
    sharedToken: "secret-token",
    store,
    inbox: new PeerInboxStore(path.join(tempDir, "inbox.jsonl")),
    integrityReviews: new IntegrityReviewStore(path.join(tempDir, "integrity-reviews.json"))
  });

  await new Promise<void>((resolve) => hub.server.listen(0, "127.0.0.1", resolve));
  const address = hub.server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unauthorizedResponse = await fetch(`${baseUrl}/api/task-requests?deviceId=windows-main`);
    assert.equal(unauthorizedResponse.status, 401);

    const authorizedResponse = await fetch(`${baseUrl}/api/task-requests?deviceId=windows-main`, {
      headers: { authorization: "Bearer secret-token" }
    });
    assert.equal(authorizedResponse.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      hub.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
