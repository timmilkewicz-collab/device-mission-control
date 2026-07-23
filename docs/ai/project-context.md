# Project Context

Device Mission Control coordinates local and tailnet-connected machines, apps, agents, Base44 snapshots, task approvals, and council sessions from one local hub.

## Goals

- Reduce dropped context across machines, repos, agents, and Base44 apps.
- Keep desktop and shell control gated behind observation, approval, and verification.
- Give agents a shared, inspectable place to coordinate work without pretending every tool runs in one runtime.
- Make durable knowledge live in files that can be reused across repos.

## Naming

- `Planner Agent` means the AI role that clarifies scope and risk.
- `OperationalBrief` means the hub read model that summarizes machine state, attention items, and suggested actions (built by `buildOperationalBrief`; formerly called the operational planner output).
- `Mission Control` means this local coordination hub.
- `Base44 Control Surface` means the hub section and APIs that read or refresh Base44 snapshots.

## Domain Glossary (DDD)

Mission Control uses these terms consistently across code, docs, and operator language:

| Term | Meaning |
|------|---------|
| **Node** | Inventory member in the fleet — may be partial, discovered, or fully integrated |
| **Device** | Instrumented agent with live observations and a task catalog |
| **ConnectionLink** | Transport path between nodes; `verified` status requires evidence-backed proof |
| **Observation** | Append-only context capture from a device — not mutable hub state |
| **TaskRequest** | Approval-gated execution request with lifecycle `pending → approved → executing → completed\|failed` |
| **OperationalBrief** | Read model: plan snapshot + desktop-control readiness evaluation |
| **CouncilSession** | Coordination session for human/AI stances — not fleet truth |
| **Base44 snapshot** | External inventory projection — never live truth |
| **CANONICAL export** | Published operational read model (`MISSION_CONTROL_LAST.md`) — downstream snapshot, not command state |

## Bounded Contexts

Mission Control is one local bounded context with anti-corruption layers to neighbors:

1. **Fleet Awareness** — nodes, links, devices, observations, verification rituals (`src/domain/fleet/`, `src/infrastructure/persistence/fleetRepository.ts`)
2. **Task Governance** — task requests, approvals, desktop-control readiness policy (`src/domain/tasks/`, `src/infrastructure/persistence/taskRepository.ts`)
3. **Council Coordination** — sessions, stances, peer inbox (`src/infrastructure/persistence/councilRepository.ts`)
4. **External Surfaces (ACLs)** — Base44, Osiris, CANONICAL export, Tailscale/SSH adapters (`src/infrastructure/base44/`, `canonical/`, `tailscale/`)

Commands mutate through application services and the hub store; queries (dashboard, `/api/state`, snapshots, export) never mutate.

Domain events (`src/domain/events.ts`) are appended to `.mission-control/data/domain-events.jsonl` for audit: observations, link verification, task decisions, identity reconciliation, CANONICAL publish.

## Current Architecture

- `src/domain/` hosts fleet and task policies plus domain event types.
- `src/application/` hosts use-case entry points (`buildOperationalBrief`, `publishCanonicalBrief`, `reconcileNodeIdentity`).
- `src/infrastructure/` hosts persistence repositories, ACL re-exports, and the domain event log.
- `src/hub/` hosts the HTTP dashboard, state store facade, planning summary, peer inbox, Base44 readers, refresh actions, and integrity review store.
- `src/agent/` hosts Windows and Linux observation agents.
- `src/shared/` hosts schemas, shared types, paths, HTTP helpers, and Base44 client helpers.
- `src/tools/` hosts command-line utilities for Base44 and mission-control maintenance.
- `.mission-control/data/` stores local runtime state, snapshots, and domain event log.
- `docs/base44/` stores active Base44 operator docs.
- `docs/archive/` stores historical and research-only docs.
- `docs/ai/` stores portable AI operating memory.

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
