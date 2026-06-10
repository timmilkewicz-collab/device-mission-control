# Active Priorities

Last updated: 2026-06-09

## Done (Mission Control finish line)

- CANONICAL project card + `PROJECT_INDEX.csv` registration
- Read-only `MISSION_CONTROL_LAST.md` exporter + daily JSON log
- Scheduled export task registrar (`Register-MissionControlExportTask.ps1`)
- Daily routine wires export + nudge echo + council cue
- Ambient signals track Mission Control staleness
- Portable services manifest path via `CANONICAL_ROOT`
- GitHub Actions CI (`check` + `test`)
- Windows hub logon task scripts + deployment runbooks

## Active (operator)

1. **Refresh network truth** — run `npm run sync:tailscale`, `verify:tailscale`, then `export:canonical-status -- --refresh-network`
2. **Resolve ProLiant / goliathsystem identity** — confirm host before trusting `proliant-ubuntu` node
3. **Hub on DHD-Admin** — register logon task (`scripts/windows/Register-MissionControlHubTask.ps1`); use port **8788** if operator dashboard keeps 8787
4. **Second-machine agent** — deploy Windows/Linux agent per `docs/ai/runbooks/agent-deployment.md`
5. **Scott field-proof check** — verify `pure-canonical-core.org/field-proof` visibility (external Base44 app)

## Deferred (explicit)

- Desktop control pilot (blocked by readiness gate)
- Hub AI memory write API
- General remote SSH task routing beyond `collect:proliant`
- Option B code copy into `CANONICAL/30_CODE/device-mission-control`

## Operating rule

Physical ops first. Mission Control is **private runtime awareness** — refresh before trusting exported node/link truth. No public exposure without token.
