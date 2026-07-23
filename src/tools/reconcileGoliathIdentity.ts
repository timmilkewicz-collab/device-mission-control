import { loadMissionControlEnv } from "../shared/env";
import { resolveDataPath } from "../shared/paths";
import {
  applyGoliathIdentityReconciliation,
  CANONICAL_LINUX_NODE_ID,
  CANONICAL_SSH_LINK_ID,
  LEGACY_LINUX_NODE_ID
} from "../hub/reconcileGoliathIdentity";
import { assertHubNotRunningForDiskWrites } from "../hub/hubLiveGuard";
import { MissionControlStore } from "../hub/store";

async function main(): Promise<void> {
  loadMissionControlEnv();
  await assertHubNotRunningForDiskWrites();

  const reconciled = applyGoliathIdentityReconciliation(resolveDataPath("hub-state.json"));
  const store = new MissionControlStore(resolveDataPath("hub-state.json"));

  console.log(
    JSON.stringify(
      {
        canonicalNode: CANONICAL_LINUX_NODE_ID,
        legacyNodeRemoved: !Object.keys(reconciled.nodes).includes(LEGACY_LINUX_NODE_ID),
        sshLink: CANONICAL_SSH_LINK_ID in reconciled.links,
        linuxNodes: Object.keys(store.getState().nodes).filter((id) => id.includes("goliath") || id.includes("proliant"))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
