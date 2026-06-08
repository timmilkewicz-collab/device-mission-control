# AI Memory

This folder is the portable memory spine for AI-assisted work in this repo. The same structure can be copied into other repos so agents have one familiar place to load durable context.

Canonical operating contract:

- root `AGENTS.md`

Core files:

- `current-state.md`: short current truth for resuming work
- `project-context.md`: stable architecture, goals, constraints, and naming

Record folders:

- `decision-records/`: meaningful architecture, workflow, deployment, or data-flow decisions
- `handoffs/`: durable notes after substantial work
- `runbooks/`: repeatable operational procedures

Rules:

- keep `current-state.md` short
- keep domain-specific docs in their domain folders and link them here
- write memory when it changes future behavior, not for every thought
- archive stale notes instead of letting them compete with current truth
