# Runbook: Mission Control Token Rollout

## When To Use

Use this when starting the hub or any agent on a machine that needs to register with Mission Control or post observations/tasks.

## Steps

1. Put the same `MISSION_CONTROL_TOKEN` in that machine's ignored local env file.
2. Set `MISSION_CONTROL_HUB_URL` to the hub URL that machine should reach.
3. Keep `MISSION_CONTROL_HOST=127.0.0.1` unless intentionally exposing the hub.
4. If exposing the hub to Tailscale or LAN, set `MISSION_CONTROL_HOST=0.0.0.0` and keep `MISSION_CONTROL_TOKEN` set.
5. Run `npm run token:status` and confirm `missionControlTokenPresent` is `true`.
6. Start the hub or agent.

## Failure Notes

If an agent receives `401`, the hub has a token but the agent is missing it or using a different value. Update the agent machine's ignored env file and restart the agent.
