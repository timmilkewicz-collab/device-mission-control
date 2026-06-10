# Hub deployment (Windows)

Run the Mission Control hub persistently on the primary workstation (typically DHD-Admin).

## Port note

CANONICAL **Operator Dashboard Server** also defaults to **TCP 8787** on DHD-Admin. Choose one:

- **Mission Control on 8787** — disable or remove the operator dashboard logon task
- **Mission Control on 8788** — keep operator dashboard on 8787; set `MISSION_CONTROL_PORT=8788` everywhere

## Prerequisites

1. `npm install` in the repo
2. `.env.local` with `MISSION_CONTROL_TOKEN` when binding beyond loopback
3. URL ACL + firewall if exposing on tailnet (`Setup-DhdAdmin.ps1` already adds 8787 ACL)

## Logon task (recommended)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Register-MissionControlHubTask.ps1 -Port 8788
```

Remove:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Register-MissionControlHubTask.ps1 -Remove
```

Tailnet exposure (token required):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Register-MissionControlHubTask.ps1 -Host 0.0.0.0 -Port 8788
```

Ensure `.env.local` includes a strong `MISSION_CONTROL_TOKEN`.

## Manual start

```bash
npm run dev:hub
```

Tailnet:

```bash
MISSION_CONTROL_HOST=0.0.0.0 MISSION_CONTROL_TOKEN=<token> npm run dev:hub
```

## Health check

```bash
curl -sS http://127.0.0.1:8787/.well-known/mission-control.json
```

## Logs

Scheduled start attempts: `.mission-control/hub-server.log`
