import { loadMissionControlEnv, resolveMissionControlHubUrl } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import {
  collectProliantObservation,
  type CollectProliantObservationResult
} from "../application/collectProliantObservation";
import { probeMissionControlHub } from "./hubLiveGuard";
import { MissionControlStore } from "./store";

async function collectViaLiveHub(hubUrl: string): Promise<CollectProliantObservationResult> {
  const token = process.env.MISSION_CONTROL_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${hubUrl.replace(/\/$/, "")}/api/fleet/collect-proliant-observation`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(90_000)
  });

  if (response.status === 404) {
    throw new Error(
      `Hub at ${hubUrl} does not expose /api/fleet/collect-proliant-observation yet. Restart the hub to load the latest code, then rerun.`
    );
  }

  if (response.status === 401) {
    throw new Error("Hub rejected the request: set MISSION_CONTROL_TOKEN in .env.local and rerun.");
  }

  if (!response.ok) {
    throw new Error(`Hub collect-proliant-observation failed (${response.status}): ${(await response.text()).trim()}`);
  }

  return (await response.json()) as CollectProliantObservationResult;
}

async function main(): Promise<void> {
  loadMissionControlEnv();

  const probe = await probeMissionControlHub(resolveMissionControlHubUrl(process.env));
  const result = probe.live
    ? await collectViaLiveHub(probe.url)
    : collectProliantObservation(new MissionControlStore(resolveDataPath("hub-state.json")));

  console.log(`Collected remote observation for ${result.deviceId} from ${result.host}`);
  console.log(result.observation.summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
