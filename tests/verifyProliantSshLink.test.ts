import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyProliantSshLink } from "../src/application/verifyProliantSshLink";
import { LEGACY_SSH_LINK_ID } from "../src/domain/fleet/nodeIdentityPolicy";
import { MissionControlStore } from "../src/hub/store";

test("verifyProliantSshLink marks missing user as blocked", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-control-ssh-"));
  const store = new MissionControlStore(path.join(tempDir, "state.json"));

  store.upsertLink({
    linkId: LEGACY_SSH_LINK_ID,
    sourceNodeId: "dhd-admin",
    targetNodeId: "proliant-ubuntu",
    transport: "ssh",
    status: "blocked",
    label: "Legacy SSH path",
    notes: ["seed"]
  });

  const previousUser = process.env.MISSION_CONTROL_PROLIANT_SSH_USER;
  delete process.env.MISSION_CONTROL_PROLIANT_SSH_USER;

  try {
    const result = verifyProliantSshLink(store, { host: "goliathsystem" });
    assert.equal(result.verified, false);
    assert.equal(result.status, "blocked");
    assert.match(result.detail, /user not configured/i);
  } finally {
    if (previousUser) {
      process.env.MISSION_CONTROL_PROLIANT_SSH_USER = previousUser;
    }
  }
});
