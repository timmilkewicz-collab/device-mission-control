import { resolveDataPath } from "../shared/paths";
import { PeerInboxStore } from "./inbox";
import { createHubServer } from "./server";
import { MissionControlStore } from "./store";

const port = Number(process.env.MISSION_CONTROL_PORT ?? 8787);
const sharedToken = process.env.MISSION_CONTROL_TOKEN;
const store = new MissionControlStore(resolveDataPath("hub-state.json"));
const inbox = new PeerInboxStore(resolveDataPath("inbox.jsonl"));
const hub = createHubServer({ port, store, inbox, sharedToken });

hub.listen().then(() => {
  console.log(`Device Mission Control hub listening on http://localhost:${port}`);
});
