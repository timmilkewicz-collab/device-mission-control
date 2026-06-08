# Current State

Last updated: 2026-06-01

**Today’s operator focus:** Charleston physical ops first; control plane checkpoint is done; one after-work verify-only task — field proof visibility for `pure-canonical-core.org` from Scott’s user-level entry point. See `docs/ai/ACTIVE_PRIORITIES.md` and `docs/ai/DAILY_CHECKPOINT_2026-06-01.md`.

Device Mission Control is a local observer-first hub with a browser dashboard, peer inbox, council bridge, device/node/link registry, task approval queue, Base44 control surface, integrity review queue, and evidence package queue.

The repo now uses a portable AI memory model:

- `AGENTS.md` defines the active agent roles and default loop
- `docs/ai/project-context.md` holds stable operating context
- decision records, handoffs, and runbooks live under `docs/ai/`

Current implementation boundary:

- markdown files are the source of truth for AI memory
- the hub displays AI memory read-only through `/api/ai/overview`, `/api/ai/records`, and the dashboard
- Base44 domain docs stay in `docs/base44/`
- archived research/reference material stays in `docs/archive/`

Current security posture:

- the hub binds to `127.0.0.1` by default
- no-token dashboard write actions are only allowed on loopback-bound startup
- non-loopback startup requires `MISSION_CONTROL_TOKEN`
- hub, agents, and council demo load `.env.local` automatically for Mission Control token settings
- `npm run token:status` confirms token presence by fingerprint without printing the token

Current network inventory caution:

- `Tim-Laptop` and `DESKTOP-HN4P1BS` are live Windows tailnet peers
- `192.168.0.174` / `goliathsystem` was previously labeled `ProLiant Ubuntu Server`, but that identity is now unconfirmed
- do not treat `192.168.0.174` as the server until a fresh identity check verifies the actual hardware
