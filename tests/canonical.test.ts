import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalRoot, resolveServicesManifestPath } from "../src/shared/canonical";

test("resolveServicesManifestPath honors explicit override", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-manifest-"));
  const manifest = path.join(tempDir, "services.manifest");
  fs.writeFileSync(manifest, "vendor#http model Label\n", "utf8");
  assert.equal(resolveServicesManifestPath({ MISSION_CONTROL_SERVICES_MANIFEST_PATH: manifest }), manifest);
});

test("resolveServicesManifestPath discovers manifest under CANONICAL root", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-canonical-root-"));
  const manifestDir = path.join(tempDir, "02_PROJECTS", "TIM_PRIVATE", ".github");
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifest = path.join(manifestDir, "services.manifest");
  fs.writeFileSync(manifest, "vendor#http model Label\n", "utf8");
  assert.equal(resolveServicesManifestPath({ CANONICAL_ROOT: tempDir }), manifest);
});

test("resolveCanonicalRoot uses CANONICAL_ROOT when present", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-root-"));
  assert.equal(resolveCanonicalRoot({ CANONICAL_ROOT: tempDir }), tempDir);
});
