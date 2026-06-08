# Network Identity Correction

Date: 2026-04-29
Role: Builder / QA

## Summary

Tim flagged that the hub may have confused his oldest laptop with the server. A fresh check confirmed that the live Tailscale map currently shows `DHD-Admin`, `Tim-Laptop`, `DESKTOP-HN4P1BS`, and `Timothy's S25 Ultra`; it does not show a ProLiant or Linux server peer.

## Evidence

- `Tim-Laptop` is a live Windows Tailscale peer at `100.82.61.65`.
- `DESKTOP-HN4P1BS` is a live Windows Tailscale peer at `100.119.145.61`.
- `192.168.0.174` did not answer ping, SSH, reverse DNS, or NetBIOS name lookup during this check.
- Older hub state recorded `192.168.0.174` as `goliathsystem` over SSH using user `macro`, but that does not prove the hardware is the server.

## Durable Correction

The seeded topology now labels the `192.168.0.174` record as `Unverified Linux Host (goliathsystem)` instead of a confirmed ProLiant server. Keep the old `proliant-ubuntu` node id for compatibility until the real server identity is verified and a cleaner migration is planned.

## Next Step

When the real server is powered on and reachable, run a fresh identity check that captures hostname, OS, LAN IP, Tailscale status if present, and a human-confirmed machine role before relabeling the hub inventory.
