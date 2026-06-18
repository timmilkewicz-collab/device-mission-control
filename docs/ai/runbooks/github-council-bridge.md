# Runbook: GitHub Council Bridge

## When To Use

Use this when an open GitHub pull request should enter the Mission Control council as a read-only review signal.

The bridge reads open PRs, changed files, review comments, issue comments, and workflow runs. It creates or updates local Mission Control council sessions with a `GitHub Repo Verifier` response.

It does not merge, publish, deploy, comment on GitHub, or change GitHub state.

## Setup

### Option A: explicit repos

```powershell
$env:MISSION_CONTROL_GITHUB_REPOS = "owner/repo,owner/other-repo"
```

### Option B: all projects in an org (recommended)

Discover every non-archived repo in configured GitHub namespaces (organizations or user accounts). Cross-account private repos visible to your token are discovered via the authenticated affiliation API.

```powershell
$env:MISSION_CONTROL_GITHUB_ORG = "timmilkewicz-collab,tbm898-source"
$env:MISSION_CONTROL_GITHUB_EXCLUDE_REPOS = "timmilkewicz-collab/Meshroom"
```

You can combine both: explicit repos are merged with org discovery and deduped.

For private repos, set one token. Prefer a least-privilege GitHub token with org/repo read access and pull request + Actions read:

```powershell
$env:MISSION_CONTROL_GITHUB_TOKEN = "<github-token>"
```

If the Mission Control hub requires a bearer token, set:

```powershell
$env:MISSION_CONTROL_TOKEN = "<mission-control-token>"
```

Optional settings:

```powershell
$env:MISSION_CONTROL_HUB_URL = "http://localhost:8787"
$env:MISSION_CONTROL_GITHUB_MAX_PRS = "5"
```

## Dry Run

Run this first. It fetches GitHub context and prints planned council sessions without posting to the hub:

```powershell
npm run github:council -- --dry-run
```

For JSON output:

```powershell
npm run github:council -- --dry-run --json
```

To target a repo without env:

```powershell
npm run github:council -- --repo owner/repo --dry-run
```

To target an entire org without env:

```powershell
npm run github:council -- --org timmilkewicz-collab --dry-run
```

## Live Local Council Sync

Start the hub:

```powershell
npm run dev:hub
```

In another terminal:

```powershell
npm run github:council
```

Expected result:

- one open council session per open PR, titled `GitHub PR Review - owner/repo#number`
- one `GitHub Repo Verifier` response per PR bridge run
- PR comments from GitHub/Copilot-like authors are marked in the prompt when present
- failing workflow runs or risk-sensitive paths produce a `concern` stance

## Mirror into Osiris (GitHub Mesh)

After council sessions exist in Mission Control, mirror them into Osiris Firestore for the HOQS operator lane.

1. Confirm hub-state has GitHub bridge sessions (topic format: `GitHub PR Review - owner/repo#number`, `requestedBy: github-council-bridge`).
2. **Persistence check:** `hub-state.json` on disk must match the live hub API. If `GET /api/council/sessions` shows sessions missing from disk, stop the hub, fix persistence (see Mission Control hub docs), and re-run the bridge. Osiris `sync:github` reads disk only.
3. From `osiris-rising-app/scripts`, run:

```powershell
npm run sync:github
```

Or sync all bridges:

```powershell
npm run sync:bridges
```

3. Firebase credentials are required on the operator machine:
   - `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account JSON, or
   - `gcloud auth application-default login`, or
   - `firebase login` (REST fallback when Admin SDK ADC is unavailable).

4. Expected Firestore paths:
   - `connector_sync/github-mesh`
   - `connector_sync/github-mesh/open_prs/{sessionId}`

5. In the Osiris Flutter app, open the HOQS lane and confirm `GitHub Mesh` shows open PR rows. Reads require the `isOsirisOperator` gate.

Repository authority: https://github.com/timmilkewicz-collab/osiris-rising-app (see `docs/REPOSITORY_AUTHORITY.md` in that repo).

6. Re-run behavior:
   - Re-running `npm run github:council` appends a new verifier response to the same open session when the topic matches.
   - Re-running `npm run sync:github` upserts current open sessions and prunes stale `open_prs` documents that no longer match.

## Verification

Open the hub dashboard or query:

```powershell
Invoke-RestMethod "http://localhost:8787/api/council/sessions"
```

Then inspect the session:

```powershell
Invoke-RestMethod "http://localhost:8787/api/council/sessions/<session-id>"
```

## Failure Notes

If GitHub returns `401` or `403`, confirm `MISSION_CONTROL_GITHUB_TOKEN` is present and has read access to the repo and Actions.

If the bridge reports no workflow runs, the PR may not have Actions runs for its head SHA, Actions may be disabled, or the token may not have access.

If the hub returns `401`, set `MISSION_CONTROL_TOKEN` to match the running hub.

If no repos are found, set `MISSION_CONTROL_GITHUB_REPOS`, `MISSION_CONTROL_GITHUB_ORG`, or pass `--repo owner/repo` / `--org org-name`.

## Boundary

This bridge is a read-only GitHub intake pipe plus a local Mission Control council writer. Posting summaries back to GitHub PRs is a separate future feature and requires explicit owner approval.
