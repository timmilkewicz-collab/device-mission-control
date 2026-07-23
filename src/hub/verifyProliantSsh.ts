import { loadMissionControlEnv } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import { assertHubNotRunningForDiskWrites } from "./hubLiveGuard";
import { MissionControlStore } from "./store";
import { verifyProliantSshLink } from "../application/verifyProliantSshLink";

async function main(): Promise<void> {
  loadMissionControlEnv();
  await assertHubNotRunningForDiskWrites();

  const store = new MissionControlStore(resolveDataPath("hub-state.json"));
  const result = verifyProliantSshLink(store);

  if (!result.user) {
    console.log("SSH verification blocked: set MISSION_CONTROL_PROLIANT_SSH_USER and rerun.");
    process.exit(0);
  }

  const prefix = result.verified ? "[verified]" : result.status === "offline" ? "[offline]" : result.status === "blocked" ? "[blocked]" : "[attempting]";
  console.log(`${prefix} ${result.user}@${result.host}: ${result.detail}`);
  process.exit(result.verified ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
