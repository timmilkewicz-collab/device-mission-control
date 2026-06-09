import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMissionControlEnv, loopbackHubProbeUrls, resolveMissionControlHubUrl } from "../src/shared/env";

test("mission-control env loader loads local files without overriding process env", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-env-"));
  fs.writeFileSync(
    path.join(tempDir, ".env.local"),
    "MISSION_CONTROL_TOKEN=from-file\nMISSION_CONTROL_HOST=127.0.0.1\n",
    "utf8"
  );
  const env: NodeJS.ProcessEnv = {
    MISSION_CONTROL_HOST: "localhost"
  };

  const loaded = loadMissionControlEnv(tempDir, env);

  assert.deepEqual(loaded, [".env.local"]);
  assert.equal(env.MISSION_CONTROL_TOKEN, "from-file");
  assert.equal(env.MISSION_CONTROL_HOST, "localhost");
});

test("mission-control env loader honors MISSION_CONTROL_ENV_FILE first", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-env-custom-"));
  fs.writeFileSync(path.join(tempDir, ".env.local"), "MISSION_CONTROL_TOKEN=local\n", "utf8");
  fs.writeFileSync(path.join(tempDir, ".env.agent.local"), "MISSION_CONTROL_TOKEN=agent\n", "utf8");
  const env: NodeJS.ProcessEnv = {
    MISSION_CONTROL_ENV_FILE: ".env.agent.local"
  };

  loadMissionControlEnv(tempDir, env);

  assert.equal(env.MISSION_CONTROL_TOKEN, "agent");
});

test("resolveMissionControlHubUrl prefers explicit hub url", () => {
  assert.equal(
    resolveMissionControlHubUrl({ MISSION_CONTROL_HUB_URL: "http://127.0.0.1:8788" }),
    "http://127.0.0.1:8788"
  );
});

test("resolveMissionControlHubUrl builds from host and port", () => {
  assert.equal(
    resolveMissionControlHubUrl({ MISSION_CONTROL_HOST: "0.0.0.0", MISSION_CONTROL_PORT: "8788" }),
    "http://127.0.0.1:8788"
  );
});

test("loopbackHubProbeUrls includes common local fallback ports", () => {
  const urls = loopbackHubProbeUrls("http://127.0.0.1:8787");
  assert.ok(urls.includes("http://127.0.0.1:8787"));
  assert.ok(urls.includes("http://127.0.0.1:8788"));
});
