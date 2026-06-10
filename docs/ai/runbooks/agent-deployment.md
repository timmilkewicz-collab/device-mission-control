# Agent deployment

Deploy observation agents so the hub has live context from more than one machine.

## Windows agent

On each Windows peer:

```bash
npm install
```

Create `.env.local`:

```env
MISSION_CONTROL_HUB_URL=http://dhd-admin.tail833d79.ts.net:8788
MISSION_CONTROL_TOKEN=<same-token-as-hub>
MISSION_CONTROL_DEVICE_ID=desktop-hn4p1bs
MISSION_CONTROL_DISPLAY_NAME=DESKTOP-HN4P1BS
```

Start:

```bash
npm run agent:windows
```

## Linux agent

On the Linux server (after SSH path is verified):

```env
MISSION_CONTROL_HUB_URL=http://<hub-tailnet-host>:8788
MISSION_CONTROL_TOKEN=<token>
MISSION_CONTROL_DEVICE_ID=proliant-ubuntu
MISSION_CONTROL_DISPLAY_NAME=ProLiant Ubuntu Server
```

Start:

```bash
npm run agent:linux
```

## Verification

1. Hub dashboard shows device as **active**
2. Observations refresh within `MISSION_CONTROL_INTERVAL_MS` (default 30s)
3. `npm run export:canonical-status` shows fresh device summaries in `MISSION_CONTROL_LAST.md`

## Token rollout

See `mission-control-token-rollout.md` for every machine that registers or posts tasks.
