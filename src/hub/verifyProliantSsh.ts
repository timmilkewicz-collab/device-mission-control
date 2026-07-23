import { loadMissionControlEnv, resolveMissionControlHubUrl } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import { verifyProliantSshLink, type ProliantSshVerifyResult } from "../application/verifyProliantSshLink";
import { probeMissionControlHub } from "./hubLiveGuard";
import { MissionControlStore } from "./store";

function printResult(result: ProliantSshVerifyResult): void {
  if (!result.user) {
    console.log("SSH verification blocked: set MISSION_CONTROL_PROLIANT_SSH_USER and rerun.");
    return;
  }

  const prefix = result.verified
    ? "[verified]"
    : result.status === "offline"
      ? "[offline]"
      : result.status === "blocked"
        ? "[blocked]"
        : "[attempting]";
  console.log(`${prefix} ${result.user}@${result.host}: ${result.detail}`);
}

async function verifyViaLiveHub(hubUrl: string): Promise<ProliantSshVerifyResult> {
  const token = process.env.MISSION_CONTROL_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${hubUrl.replace(/\/$/, "")}/api/fleet/verify-proliant-ssh`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(30_000)
  });

  if (response.status === 404) {
    throw new Error(
      `Hub at ${hubUrl} does not expose /api/fleet/verify-proliant-ssh yet. Restart the hub to load the latest code, then rerun.`
    );
  }

  if (response.status === 401) {
    throw new Error("Hub rejected the request: set MISSION_CONTROL_TOKEN in .env.local and rerun.");
  }

  if (!response.ok) {
    throw new Error(`Hub verify-proliant-ssh failed (${response.status}): ${(await response.text()).trim()}`);
  }

  return (await response.json()) as ProliantSshVerifyResult;
}

async function main(): Promise<void> {
  loadMissionControlEnv();

  const probe = await probeMissionControlHub(resolveMissionControlHubUrl(process.env));
  const result = probe.live
    ? await verifyViaLiveHub(probe.url)
    : verifyProliantSshLink(new MissionControlStore(resolveDataPath("hub-state.json")));

  printResult(result);
  process.exit(result.verified ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
