/**
 * Smoke-test the council API against a running hub.
 * Start the hub first: npm run dev:hub
 * Then: npm run council:demo
 *
 * Optional: MISSION_CONTROL_HUB_URL (default http://localhost:8787), MISSION_CONTROL_TOKEN
 */

import { loadMissionControlEnv } from "../shared/env";

loadMissionControlEnv();

const base = (process.env.MISSION_CONTROL_HUB_URL ?? "http://localhost:8787").replace(/\/$/, "");
const token = process.env.MISSION_CONTROL_TOKEN;

function jsonHeaders(): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function main(): Promise<void> {
  const createRes = await fetch(`${base}/api/council/sessions`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      topic: "Council demo (npm run council:demo)",
      prompt: "Warm check from the hub automation. One small step for the council.",
      requestedBy: "council:demo",
      targetMemberIds: []
    })
  });
  if (!createRes.ok) {
    throw new Error(`Create session failed: ${createRes.status} ${await createRes.text()}`);
  }
  const session = (await createRes.json()) as { id: string };

  const respondRes = await fetch(`${base}/api/council/sessions/${encodeURIComponent(session.id)}/responses`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      memberId: "demo-runner",
      memberLabel: "npm script",
      stance: "inform",
      summary: "Flow OK: create, respond, GET by id.",
      detail: `Hub base: ${base}`
    })
  });
  if (!respondRes.ok) {
    throw new Error(`Add response failed: ${respondRes.status} ${await respondRes.text()}`);
  }

  const getRes = await fetch(`${base}/api/council/sessions/${encodeURIComponent(session.id)}`);
  if (!getRes.ok) {
    throw new Error(`GET session failed: ${getRes.status} ${await getRes.text()}`);
  }
  const roundTrip = (await getRes.json()) as { id: string; responses: unknown[] };

  console.log(`Session id: ${roundTrip.id}`);
  console.log(`GET URL:    ${base}/api/council/sessions/${roundTrip.id}`);
  console.log(`Responses:  ${roundTrip.responses.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
