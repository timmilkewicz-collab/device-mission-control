import { resolveDataPath } from "../shared/paths";
import { loadMissionControlEnv } from "../shared/env";
import { PeerInboxStore } from "./inbox";
import { IntegrityReviewStore } from "./integrityReviewStore";
import { createHubServer } from "./server";
import { MissionControlStore } from "./store";

loadMissionControlEnv();
const port = Number(process.env.MISSION_CONTROL_PORT ?? 8787);
const host = process.env.MISSION_CONTROL_HOST?.trim() || "127.0.0.1";
const sharedToken = process.env.MISSION_CONTROL_TOKEN?.trim() || undefined;
const statePath = resolveDataPath("hub-state.json");
const store = new MissionControlStore(statePath);
const inbox = new PeerInboxStore(resolveDataPath("inbox.jsonl"));
const integrityReviews = new IntegrityReviewStore(resolveDataPath("base44-integrity-reviews.json"));
const hub = createHubServer({ port, host, store, inbox, integrityReviews, sharedToken });

hub.listen().then(() => {
  console.log(`Device Mission Control hub listening on http://${host}:${port}`);
  console.log(`Mission Control state file: ${statePath}`);
});
