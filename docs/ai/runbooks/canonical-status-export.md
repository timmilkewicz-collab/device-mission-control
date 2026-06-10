# CANONICAL status export

Write a read-only operational snapshot from Mission Control into CANONICAL.

## Output

- `CANONICAL/01_OPS/REMINDERS/MISSION_CONTROL_LAST.md`
- `CANONICAL/01_OPS/LOGS/mission_control_status_YYYY-MM-DD.log` (JSON lines)

## From the Mission Control repo

```bash
npm run export:canonical-status
```

Optional network refresh before export:

```bash
npm run export:canonical-status -- --refresh-network
```

Dry run (stdout JSON summary, no CANONICAL write):

```bash
npm run export:canonical-status -- --no-write
```

## From CANONICAL

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 01_OPS/mission-control/Invoke-MissionControlCanonicalExport.ps1
```

With Tailscale refresh:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 01_OPS/mission-control/Invoke-MissionControlCanonicalExport.ps1 -RefreshNetwork
```

## Scheduled export (DHD-Admin)

Register daily task (default 08:30, after Sentinel 08:15):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 01_OPS/mission-control/Register-MissionControlExportTask.ps1
```

The **CANONICAL Daily Routine** (07:00) also runs the export inline and echoes status in `LAST_DAILY_RUN.md`.

## Environment

- `CANONICAL_ROOT` or `MISSION_CONTROL_CANONICAL_ROOT` — target CANONICAL tree
- Default fallback: `%USERPROFILE%\Dropbox\CANONICAL`

## Boundaries

- Read-only export; does not mutate hub state or Base44 live data
- Does not copy `.env`, `.mission-control/data`, screenshots, or local artifacts into CANONICAL
- Treat exported node/link truth as stale until refresh ritual has run recently
