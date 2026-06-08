import { createHash } from "node:crypto";
import { loadMissionControlEnv } from "../shared/env";

function fingerprintToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

loadMissionControlEnv();

const token = process.env.MISSION_CONTROL_TOKEN?.trim();
const host = process.env.MISSION_CONTROL_HOST?.trim() || "127.0.0.1";
const hubUrl = process.env.MISSION_CONTROL_HUB_URL?.trim() || "http://localhost:8787";

console.log(
  JSON.stringify(
    {
      missionControlTokenPresent: Boolean(token),
      missionControlTokenFingerprint: token ? fingerprintToken(token) : undefined,
      host,
      hubUrl,
      envFile: process.env.MISSION_CONTROL_ENV_FILE || ".env.local/.env"
    },
    null,
    2
  )
);
