# Decision: Mission Control Env Token Loading

Date: 2026-04-29

Status: accepted

## Context

Mission Control could require a shared token, and agents could send one, but the hub and agents read only process environment variables. A local `.env.local` token would not affect normal `npm run` usage unless the shell manually exported it first.

## Decision

Add a small shared env loader for Mission Control settings. The hub, Windows agent, Linux agent, and council demo load `MISSION_CONTROL_ENV_FILE` first when set, then `.env.local`, then `.env`. Existing process environment values still win.

## Consequences

The ignored `.env.local` file can now carry a real local `MISSION_CONTROL_TOKEN` for this machine. Other machines can copy the same variable names into their own local env files. Network exposure still requires a token.
