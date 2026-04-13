# Device Mission Control

Observer-first mission control for a Windows workstation, a Linux/home-server agent, and a central hub.

## What is implemented

- `hub`: HTTP dashboard and API for nodes, links, devices, observations, plan snapshots, task requests, approvals, and council sessions
- `windows agent`: reports active window, screenshot attempts, services, and processes
- `linux agent`: reports active window/workspace when available, screenshot attempts, services, processes, and containers
- `shared protocol`: validated schemas for registrations, observations, task requests, approvals, and desktop-control readiness
- `desktop control evaluation`: a built-in readiness gate that keeps keyboard/mouse control disabled until the observer-first flow has enough history

## Run it

Install dependencies:

```bash
npm install
```

Start the hub:

```bash
npm run dev:hub
```

Seed the hub with the known nodes and links discovered so far:

```bash
npm run seed:known-network
```

Refresh node and link status from the live tailnet:

```bash
npm run sync:tailscale
```

Verify live Tailscale links and promote proven paths to `verified`:

```bash
npm run verify:tailscale
```

Verify the ProLiant SSH path once a login is known:

```bash
MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> npm run verify:proliant-ssh
```

Or, for a one-off verification when the server is still password-authenticated:

```bash
MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> MISSION_CONTROL_PROLIANT_SSH_PASSWORD=<password> npm run verify:proliant-ssh
```

Pull a real observation from the ProLiant over SSH and store it in the hub:

```bash
MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> MISSION_CONTROL_PROLIANT_SSH_PASSWORD=<password> npm run collect:proliant
```

Import a services inventory from a manifest file into the node registry:

```bash
npm run import:services-manifest
```

Start the Windows agent:

```bash
npm run agent:windows
```

Start the Linux agent:

```bash
npm run agent:linux
```

Optional environment variables:

- `MISSION_CONTROL_PORT`: hub port, default `8787`
- `MISSION_CONTROL_HUB_URL`: agent target, default `http://localhost:8787`
- `MISSION_CONTROL_TOKEN`: shared bearer token for protected POST routes
- `MISSION_CONTROL_DEVICE_ID`: per-agent device id
- `MISSION_CONTROL_DISPLAY_NAME`: per-agent display name
- `MISSION_CONTROL_INTERVAL_MS`: observation interval, default `30000`
- `MISSION_WORKSPACE_ROOT`: optional path exposed by the `show_workspace_root` task
- `MISSION_CONTROL_PROLIANT_SSH_HOST`: optional override for the ProLiant host, default `192.168.0.174`
- `MISSION_CONTROL_PROLIANT_SSH_PORT`: optional override for the ProLiant SSH port, default `22`
- `MISSION_CONTROL_PROLIANT_SSH_USER`: Linux username to verify the ProLiant SSH path
- `MISSION_CONTROL_PROLIANT_SSH_KEY_PATH`: optional SSH private key path used by `npm run verify:proliant-ssh`
- `MISSION_CONTROL_PROLIANT_SSH_PASSWORD`: optional one-off password-backed verification path for `npm run verify:proliant-ssh`
- `MISSION_CONTROL_PROLIANT_DEVICE_ID`: optional device id for remote ProLiant observations, default `proliant-ubuntu`
- `MISSION_CONTROL_PROLIANT_DISPLAY_NAME`: optional display name for remote ProLiant observations
- `MISSION_CONTROL_SERVICES_MANIFEST_PATH`: optional override for the services manifest import path

## Main endpoints

- `GET /`: HTML dashboard
- `GET /v1/inbox?limit=50`: peer inbox messages, newest first
- `POST /v1/inbox`: append a peer inbox message with `{ "role": "cursor" | "codex" | "human", "text": "..." }`
- `GET /.well-known/mission-control.json`: discovery manifest for agents and other machines
- `GET /api/nodes`: registered network nodes and partial integrations
- `GET /api/links`: registered connection paths between nodes
- `GET /api/state`: raw state plus latest plan snapshot
- `GET /api/approvals`: pending task approvals
- `GET /api/council/sessions`: current and recent council sessions
- `GET /api/desktop-control/evaluation`: readiness gate output
- `POST /api/devices/register`: register or refresh a device
- `POST /api/nodes`: create or update a node registry entry
- `POST /api/links`: create or update a connection link
- `POST /api/observations`: submit an observation
- `POST /api/task-requests`: request a named task
- `POST /api/task-requests/:id/decision`: approve or reject a task
- `POST /api/task-requests/:id/result`: update task execution status/result
- `POST /api/council/sessions`: open a council session
- `POST /api/council/sessions/:id/responses`: submit an agent or tool response
- `POST /api/council/sessions/:id/close`: close a council session

## Agent discovery

Agents and external tools should start with:

```bash
GET /.well-known/mission-control.json
```

That manifest tells other machines and LLM agents:

- where the hub is
- which endpoints exist
- whether writes are open locally or require a bearer token
- what order to query the hub in for a clean startup

Recommended startup flow for outside agents:

1. fetch the discovery manifest
2. fetch `/api/state`
3. fetch `/api/nodes`
4. fetch `/api/links`
5. then decide whether to register, observe, respond to council, or request/execute tasks

For Tailscale-connected machines, a practical local workflow is:

1. `npm run seed:known-network`
2. `npm run sync:tailscale`
3. `npm run verify:tailscale`
4. `MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> npm run verify:proliant-ssh`
5. `MISSION_CONTROL_PROLIANT_SSH_USER=<linux-user> MISSION_CONTROL_PROLIANT_SSH_PASSWORD=<password> npm run collect:proliant`
6. `npm run import:services-manifest`
7. start the hub
8. let outside agents discover it via `/.well-known/mission-control.json`

## Dashboard workflow

When `MISSION_CONTROL_TOKEN` is not set, the dashboard can drive the observer-first loop directly:

- request named tasks from each registered device
- approve or reject pending task requests from the approval queue
- review recent task outcomes alongside device summaries
- open council sessions to gather input from multiple machines or external agents

If `MISSION_CONTROL_TOKEN` is set, browser forms stay disabled by policy and task mutations should go through the JSON API with a bearer token.

## Node registry

The hub now tracks nodes separately from device observations so partially integrated members can appear early:

- represent machines, servers, apps, agents, phones, and wearables
- track reachability such as Tailscale, SSH, local agents, or companion links
- mark integration state as discovered, reachable, partial, active, or offline
- link a node to a mission-control device id when a full agent is available

This lets the tailnet map grow before every member is fully instrumented.

## Connection links

The hub now tracks connection paths separately from nodes:

- represent source-to-target paths like Dell 2-in-1 -> main machine over SSH
- record transport such as Tailscale, SSH, local-agent, companion, or HTTP
- track status as planned, attempting, reachable, verified, blocked, or offline
- keep setup notes visible while a path is still being proven out

This is the first practical step toward real cross-system execution because it gives connection work its own place in the model.

For live Tailscale members, `npm run verify:tailscale` can now promote a path from `reachable` to `verified` when a one-shot Tailscale ping succeeds. It also records route quality in link notes so you can tell whether a verified path is direct or relay-backed through DERP.

For the ProLiant server, `npm run verify:proliant-ssh` promotes the SSH link once a real login path succeeds, and otherwise records whether the remaining blocker is auth or reachability. It can use either a key-based path or a one-off password-backed check when that is the only working login method.

`npm run collect:proliant` is the first real cross-node run in the repo: it logs into the verified ProLiant SSH path, registers the server as a Linux device if needed, and stores a live observation with services, top processes, containers, and uptime in the hub state.

`npm run import:services-manifest` turns a discovery inventory like `services.manifest` into registry nodes so those services can show up in the hub as real discovered endpoints instead of a disconnected reference file.

## Peer inbox

The hub now includes a lightweight shared bus for people and agents to talk over the tailnet without assuming a private Codex backchannel:

- storage: `.mission-control/data/inbox.jsonl`
- `POST /v1/inbox` to append `{ "role": "cursor" | "codex" | "human", "text": "..." }`
- `GET /v1/inbox?limit=50` to read recent messages, newest first
- the dashboard includes a `Peer Inbox` section for sending and refreshing messages

Example from another Tailscale machine:

```bash
curl -X POST "http://dhd-admin.tail833d79.ts.net:8787/v1/inbox" \
  -H "content-type: application/json" \
  -d "{\"role\":\"cursor\",\"text\":\"Remote bridge is up on the Dell 2-in-1.\"}"
```

## Council bridge

The hub can now act as a lightweight bridge for a small council of agents:

- open a session with a topic, prompt, and optional target member ids
- let outside tools or machines post structured responses over the JSON API
- keep the council thread visible in the same place as device status and task approvals

This is intentionally simple: it gives you one coordination surface for Tailscale-connected machines, Cursor, and other agents without pretending they all run inside the same runtime.

## Approval-gated task model

Each agent exposes a small named catalog:

- `collect_now`
- `capture_screenshot`
- `show_home_directory`
- `show_workspace_root`

The hub stores every request and keeps devices on `approval` mode by default. That gives you a usable approval queue before any freeform shell or desktop control is unlocked.

## Desktop control evaluation

The plan asked to evaluate whether a separate desktop pilot agent is worth adding. That logic now lives in the hub and stays conservative:

- requires at least two devices
- requires a useful observation history
- requires successful approval-gated task runs
- blocks promotion if failures dominate or elevated permissions are already enabled

This means the repo now encodes the evaluation step without enabling full remote control prematurely.
