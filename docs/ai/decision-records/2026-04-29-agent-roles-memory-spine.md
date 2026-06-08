# Decision: Agent Roles Memory Spine

Date: 2026-04-29

Status: accepted

## Context

Mission Control had growing code and Base44 integration, but the AI operating model was still mostly conversational. The role loop and memory responsibilities needed to become durable enough for Codex, Cursor, and future agents to follow across repos.

## Decision

Use root `AGENTS.md` as the repo-level operating contract and `docs/ai/` as the portable memory spine. Markdown remains the source of truth. The hub mirrors the memory read-only so operators can see role state and recent records from the dashboard.

## Consequences

Agents have a standard place to load role rules, project context, current state, handoffs, runbooks, and decision records. The hub can surface this context without becoming another authoring surface. Other repos can copy the same structure when they need the same workflow discipline.
