# Current State

Last updated: 2026-06-09

Device Mission Control is a local observer-first hub with dashboard, peer inbox, council bridge, device/node/link registry, task approval queue, Base44 control surface, integrity review queue, and evidence package queue.

## CANONICAL integration

- Registered in `CANONICAL/00_CONTROL_PLANE` as private Goliath + CANONICAL runtime awareness layer
- `npm run export:canonical-status` writes `01_OPS/REMINDERS/MISSION_CONTROL_LAST.md`
- Daily routine and optional scheduled task (`CANONICAL Mission Control Export` @ 08:30) refresh the snapshot
- Repo stays at `Documents/device-mission-control` (Option A)

## Security posture

- Hub binds to `127.0.0.1` by default
- Non-loopback startup requires `MISSION_CONTROL_TOKEN`
- Hub, agents, and council demo load `.env.local` automatically
- `npm run token:status` confirms token presence without printing it

## Production deployment

- Hub logon task: `scripts/windows/Register-MissionControlHubTask.ps1` (see port 8787 note vs operator dashboard)
- Agent rollout: `docs/ai/runbooks/agent-deployment.md`
- Export ritual: `docs/ai/runbooks/canonical-status-export.md`
- CI: `.github/workflows/ci.yml`

## Network inventory caution

- `Tim-Laptop` and `DESKTOP-HN4P1BS` are Windows tailnet peers
- `goliathsystem` is the **canonical Linux node id** (legacy `proliant-ubuntu` merged 2026-06-09); hardware role as ProLiant still needs human confirmation
- Refresh tailscale + SSH paths before trusting exported link status

## AI memory

- Markdown under `docs/ai/` is canonical; hub `/api/ai/*` is read-only mirror
- `AGENTS.md` defines Planner / Builder / QA / Librarian loop
