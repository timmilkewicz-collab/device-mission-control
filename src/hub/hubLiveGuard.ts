import { loopbackHubProbeUrls, resolveMissionControlHubUrl } from "../shared/env";

const MISSION_CONTROL_MANIFEST_NAME = "device-mission-control";

export type HubDiscoveryManifest = {
  name?: string;
};

export async function probeMissionControlHub(
  hubUrl = resolveMissionControlHubUrl(process.env),
): Promise<{ live: boolean; manifest?: HubDiscoveryManifest; url: string }> {
  const candidates = loopbackHubProbeUrls(hubUrl);

  for (const candidate of candidates) {
    try {
      const response = await fetch(
        `${candidate.replace(/\/$/, "")}/.well-known/mission-control.json`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (!response.ok) {
        continue;
      }
      const manifest = (await response.json()) as HubDiscoveryManifest;
      if (manifest.name === MISSION_CONTROL_MANIFEST_NAME) {
        return { live: true, manifest, url: candidate };
      }
    } catch {
      // try next candidate
    }
  }

  return { live: false, url: candidates[0] ?? hubUrl };
}

export async function assertHubNotRunningForDiskWrites(
  hubUrl = resolveMissionControlHubUrl(process.env),
): Promise<void> {
  const probe = await probeMissionControlHub(hubUrl);
  if (!probe.live) {
    return;
  }

  throw new Error(
    `Mission Control hub is running at ${probe.url}. Stop the hub or use hub HTTP APIs instead of writing hub-state.json directly from this CLI.`,
  );
}
