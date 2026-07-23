import test from "node:test";
import assert from "node:assert/strict";
import { linkVerificationPolicy } from "../src/domain/fleet/linkVerificationPolicy";
import { LinkRecord } from "../src/shared/types";

const baseLink: LinkRecord = {
  linkId: "link-1",
  sourceNodeId: "remote",
  targetNodeId: "self",
  transport: "tailscale",
  status: "reachable",
  label: "Remote to self",
  notes: ["Existing note"],
  registeredAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

test("link verification promotes to verified only with proof", () => {
  assert.equal(
    linkVerificationPolicy.canPromoteToVerified({
      verified: true,
      online: true,
      detail: "pong from 100.64.0.2",
      target: "100.64.0.2",
      checkedAt: new Date().toISOString(),
      routeQuality: "direct"
    }),
    true
  );

  assert.equal(
    linkVerificationPolicy.canPromoteToVerified({
      verified: false,
      online: true,
      detail: "",
      target: "100.64.0.2",
      checkedAt: new Date().toISOString()
    }),
    false
  );
});

test("link verification resolves offline peers to offline status", () => {
  const status = linkVerificationPolicy.resolveStatusAfterVerification("reachable", {
    verified: false,
    online: false
  });

  assert.equal(status, "offline");
});

test("link verification rebuilds notes without stale verification prefixes", () => {
  const notes = linkVerificationPolicy.buildVerificationNotes(
    {
      ...baseLink,
      notes: ["Verification target old-ip", "Route quality relay", "Keep this note"]
    },
    {
      verified: true,
      online: true,
      detail: "pong from 100.64.0.3",
      target: "100.64.0.3",
      checkedAt: new Date().toISOString(),
      routeQuality: "direct"
    }
  );

  assert.ok(notes.includes("Keep this note"));
  assert.ok(notes.some((note) => note.startsWith("Verification target 100.64.0.3")));
  assert.ok(notes.some((note) => note.startsWith("Route quality direct")));
});
