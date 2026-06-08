# Project Context

Device Mission Control coordinates local and tailnet-connected machines, apps, agents, Base44 snapshots, task approvals, and council sessions from one local hub.

## Goals

- Reduce dropped context across machines, repos, agents, and Base44 apps.
- Keep desktop and shell control gated behind observation, approval, and verification.
- Give agents a shared, inspectable place to coordinate work without pretending every tool runs in one runtime.
- Make durable knowledge live in files that can be reused across repos.

## Current Architecture

- `src/hub/` hosts the HTTP dashboard, state store, planning summary, peer inbox, Base44 readers, refresh actions, and integrity review store.
- `src/agent/` hosts Windows and Linux observation agents.
- `src/shared/` hosts schemas, shared types, paths, HTTP helpers, and Base44 client helpers.
- `src/tools/` hosts command-line utilities for Base44 and mission-control maintenance.
- `.mission-control/data/` stores local runtime state and snapshots.
- `docs/base44/` stores active Base44 operator docs.
- `docs/archive/` stores historical and research-only docs.
- `docs/ai/` stores portable AI operating memory.

## Naming

- `Planner Agent` means the AI role that clarifies scope and risk.
- `operational planner` means the hub code that summarizes machine state and suggested actions.
- `Mission Control` means this local coordination hub.
- `Base44 Control Surface` means the hub section and APIs that read or refresh Base44 snapshots.

## Operating Rules

- Observer-first remains the default. Direct desktop control is blocked until the readiness gate says a narrow pilot is justified.
- Markdown memory is canonical. Hub AI-memory endpoints are read-only mirrors.
- Base44 API keys stay in local env files and must not be committed.
- Machine identity must be verified by more than an old IP address or stale SSH note before labeling a host as a server.
- Substantial work should leave a handoff.
- Meaningful architecture, workflow, deployment, or data-flow choices should leave a decision record.
- Repeatable operational procedures should become runbooks.

## Domain Links

- Base44 docs: `docs/base44/README.md`
- Documentation map: `docs/README.md`
- Agent role contract: `AGENTS.md`
