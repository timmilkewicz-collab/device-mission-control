# Runbook: AI Memory Check

## When To Use

Use this before handing a branch to another agent, after adding role/memory docs, or when the AI operating layer feels stale.

## Steps

1. Run `npm run ai:check`.
2. Confirm `AGENTS.md`, `docs/ai/current-state.md`, `docs/ai/project-context.md`, and the record folders exist.
3. Run `npm run check`.
4. Run `npm test` when code changed.

## Failure Notes

If `ai:check` fails, restore the missing file or folder before continuing. If the missing item was intentionally removed, update `src/tools/aiCheck.ts` and write a decision record explaining the new memory shape.
