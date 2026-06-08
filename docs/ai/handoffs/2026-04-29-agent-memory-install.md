# Handoff: Agent Memory Install

Date: 2026-04-29

Active role: Builder

## What Changed

Installed the shared agent-role operating contract and portable `docs/ai/` memory structure. The hub now reads that memory through `/api/ai/overview`, `/api/ai/records`, and the dashboard so Mission Control can show the active role loop and latest durable records.

## Verification

Run:

```powershell
npm run ai:check
npm run check
npm test
```

## Next Useful Step

Copy the `AGENTS.md` plus `docs/ai/` pattern into the next repo that needs the same agent workflow.

## Watchouts

Markdown is the canonical authoring surface. Hub endpoints should stay read-only until there is a clear reason to edit memory through the dashboard.
