# Runbook: GitHub Council Bridge

## When To Use

Use this when an open GitHub pull request should enter the Mission Control council as a read-only review signal.

The bridge reads open PRs, changed files, review comments, issue comments, and workflow runs. It creates or updates local Mission Control council sessions with a `GitHub Repo Verifier` response.

It does not merge, publish, deploy, comment on GitHub, or change GitHub state.

## Setup

Set the target repos:

```powershell
$env:MISSION_CONTROL_GITHUB_REPOS = "owner/repo"
```

For private repos, set one token. Prefer a least-privilege GitHub token with pull request and Actions read access:

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

If no repos are found, set `MISSION_CONTROL_GITHUB_REPOS` or pass `--repo owner/repo`.

## Boundary

This bridge is a read-only GitHub intake pipe plus a local Mission Control council writer. Posting summaries back to GitHub PRs is a separate future feature and requires explicit owner approval.
