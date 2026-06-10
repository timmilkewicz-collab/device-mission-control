# Decision Record: goliathsystem as canonical Linux node id

Date: 2026-06-09
Owner: Tim
System: Device Mission Control
Rail: Goliath

## Context

Tailscale sync verified `goliathsystem` as a live direct peer while legacy `proliant-ubuntu` remained a stale duplicate from older SSH probes and seed data.

## Decision

Use `goliathsystem` as the canonical node and device id for the Linux server lane. Migrate legacy `proliant-ubuntu` records into `goliathsystem` and remove the duplicate node. Rename the SSH link to `dhd-admin-to-goliath-ssh`.

## Why

Exported CANONICAL truth and the dashboard were internally inconsistent when two node ids described the same host. Tailscale verification is the stronger live signal.

## Risks

Hardware role is still not human-confirmed as ProLiant. SSH may remain blocked until credentials and host reachability are configured.

## Alternatives Considered

- Keep both nodes indefinitely — rejected because it pollutes operational truth.
- Rename everything to `proliant-ubuntu` — rejected because Tailscale hostname is `goliathsystem`.

## Required Follow-Up

- Set `MISSION_CONTROL_PROLIANT_SSH_USER` and verify SSH.
- Run `collect:proliant` for a fresh Linux observation under `goliathsystem`.
- Human-confirm whether this host is the intended ProLiant server.

## Status

Implemented
