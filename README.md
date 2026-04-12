# Device Mission Control

Observer-first mission control for a Windows workstation, a Linux/home-server agent, and a central hub.

## What is implemented

- `hub`: HTTP dashboard and API for devices, observations, plan snapshots, task requests, approvals, and council sessions
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

## Main endpoints

- `GET /`: HTML dashboard
- `GET /api/state`: raw state plus latest plan snapshot
- `GET /api/approvals`: pending task approvals
- `GET /api/council/sessions`: current and recent council sessions
- `GET /api/desktop-control/evaluation`: readiness gate output
- `POST /api/devices/register`: register or refresh a device
- `POST /api/observations`: submit an observation
- `POST /api/task-requests`: request a named task
- `POST /api/task-requests/:id/decision`: approve or reject a task
- `POST /api/task-requests/:id/result`: update task execution status/result
- `POST /api/council/sessions`: open a council session
- `POST /api/council/sessions/:id/responses`: submit an agent or tool response
- `POST /api/council/sessions/:id/close`: close a council session

## Dashboard workflow

When `MISSION_CONTROL_TOKEN` is not set, the dashboard can drive the observer-first loop directly:

- request named tasks from each registered device
- approve or reject pending task requests from the approval queue
- review recent task outcomes alongside device summaries
- open council sessions to gather input from multiple machines or external agents

If `MISSION_CONTROL_TOKEN` is set, browser forms stay disabled by policy and task mutations should go through the JSON API with a bearer token.

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
