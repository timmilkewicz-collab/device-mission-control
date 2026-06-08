# Decision: Loopback Default Security

Date: 2026-04-29

Status: accepted

## Context

Mission Control allowed no-token dashboard and JSON write actions, but the HTTP server used the default Node listen behavior. That could expose write-capable routes beyond the local machine if the process bound to every interface.

## Decision

Bind the hub to `127.0.0.1` by default. Allow explicit non-loopback binding only when `MISSION_CONTROL_TOKEN` is set. The discovery manifest reports the bind host and whether writes are loopback-only or token-protected.

## Consequences

Local dashboard use stays simple. Tailnet or LAN use now requires an explicit host and bearer token, which makes network exposure intentional instead of accidental.
