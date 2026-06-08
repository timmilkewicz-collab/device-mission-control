import { AiMemoryOverview, AiMemoryRecord } from "./aiMemory";
import { Base44AppSnapshot, Base44EvidencePackage, Base44IntegrityAlert } from "./base44Snapshots";
import { CouncilSession, HubState, PeerInboxMessage, PlanSnapshot, TaskRequest } from "../shared/types";

type DashboardOptions = {
  inboxMessages: PeerInboxMessage[];
  interactive: boolean;
  base44Apps: Base44AppSnapshot[];
  base44IntegrityAlerts: Base44IntegrityAlert[];
  base44EvidencePackages: Base44EvidencePackage[];
  aiMemoryOverview: AiMemoryOverview;
};

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "<li>None</li>";
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function extractRouteQuality(notes: string[]): string | undefined {
  const note = notes.find((entry) => entry.startsWith("Route quality "));
  return note ? note.slice("Route quality ".length) : undefined;
}

function renderStatusBadge(label: string, tone: "good" | "warn" | "muted"): string {
  const styles = {
    good: "background:rgba(31,138,98,0.16);color:#d5f6e8;border:1px solid rgba(31,138,98,0.34);",
    warn: "background:rgba(173,91,53,0.16);color:#ffe0d2;border:1px solid rgba(173,91,53,0.36);",
    muted: "background:rgba(111,145,153,0.12);color:#d8e2e4;border:1px solid rgba(111,145,153,0.28);"
  };

  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;${styles[tone]}">${escapeHtml(
    label
  )}</span>`;
}

function normalizeBadgeTone(value: string | undefined): "good" | "warn" | "muted" {
  switch (value) {
    case "completed":
    case "resolved":
      return "good";
    case "critical":
    case "high":
    case "escalated":
    case "under_review":
      return "warn";
    default:
      return "muted";
  }
}

export function renderDashboard(state: HubState, snapshot: PlanSnapshot, options: DashboardOptions): string {
  const nodes = Object.values(state.nodes).sort((left, right) => left.label.localeCompare(right.label));
  const links = Object.values(state.links).sort((left, right) => left.label.localeCompare(right.label));
  const devices = Object.values(state.devices);
  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  const recentTasks = [...state.taskRequests].slice(-8).reverse();
  const councilSessions = [...state.councilSessions].slice(-6).reverse();
  const inboxMessages = options.inboxMessages;
  const base44Apps = options.base44Apps;
  const base44IntegrityAlerts = options.base44IntegrityAlerts;
  const base44EvidencePackages = options.base44EvidencePackages;
  const aiMemoryOverview = options.aiMemoryOverview;
  const aiMemoryRecordCount =
    aiMemoryOverview.records.decision.length + aiMemoryOverview.records.handoff.length + aiMemoryOverview.records.runbook.length;
  const acknowledgedAlerts = base44IntegrityAlerts.filter((alert) => Boolean(alert.acknowledgedAt)).length;
  const alertsWithEvidence = base44IntegrityAlerts.filter((alert) => (alert.evidencePackageCount ?? 0) > 0).length;
  const openCouncils = state.councilSessions.filter((session) => session.status === "open").length;
  const commandStats = [
    {
      label: "Integrity",
      value: String(base44IntegrityAlerts.length),
      detail: alertsWithEvidence > 0 ? `${alertsWithEvidence} linked to evidence` : "no linked evidence yet"
    },
    {
      label: "Evidence",
      value: String(base44EvidencePackages.length),
      detail: base44EvidencePackages.length > 0 ? "sealed and active packages ready" : "waiting on first package pull"
    },
    {
      label: "Approvals",
      value: String(pendingApprovals.length),
      detail: pendingApprovals.length > 0 ? "operator action required" : "queue is clear"
    },
    {
      label: "Councils",
      value: String(openCouncils),
      detail: openCouncils > 0 ? "live coordination sessions" : "no open sessions"
    },
    {
      label: "Devices",
      value: String(devices.length),
      detail: devices.length > 0 ? "registered operational surfaces" : "no devices registered yet"
    },
    {
      label: "Base44",
      value: String(base44Apps.length),
      detail: base44Apps.length > 0 ? `${acknowledgedAlerts} acknowledged alerts` : "no Base44 lanes connected"
    },
    {
      label: "AI Memory",
      value: String(aiMemoryRecordCount),
      detail: `${aiMemoryOverview.defaultLoop.join(" -> ")}`
    }
  ];
  const commandNav = [
    { href: "#integrity", label: "Integrity" },
    { href: "#evidence", label: "Evidence" },
    { href: "#base44", label: "Base44" },
    { href: "#ai-memory", label: "AI Memory" },
    { href: "#systems", label: "Systems" },
    { href: "#actions", label: "Actions" },
    { href: "#council", label: "Council" }
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Device Mission Control</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;700&display=swap");
      :root {
        --bg: #071015;
        --bg-deep: #0b1418;
        --panel: rgba(12, 23, 29, 0.92);
        --panel-strong: rgba(15, 27, 34, 0.96);
        --line: rgba(111, 145, 153, 0.24);
        --line-strong: rgba(214, 164, 73, 0.34);
        --text: #e8eee9;
        --muted: #9eb0b3;
        --accent: #d6a449;
        --accent-soft: rgba(214, 164, 73, 0.14);
        --cyan-soft: rgba(95, 171, 184, 0.12);
        --good: #1f8a62;
        --warn: #ad5b35;
        --mono: "IBM Plex Mono", "Consolas", monospace;
        --sans: "Space Grotesk", "Trebuchet MS", sans-serif;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: var(--sans);
        background:
          radial-gradient(circle at top left, rgba(214, 164, 73, 0.12), transparent 34%),
          radial-gradient(circle at 84% 12%, rgba(74, 133, 145, 0.18), transparent 24%),
          linear-gradient(180deg, var(--bg) 0%, var(--bg-deep) 42%, #0a1517 100%);
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.16;
        background-image:
          linear-gradient(rgba(214, 164, 73, 0.18) 1px, transparent 1px),
          linear-gradient(90deg, rgba(214, 164, 73, 0.12) 1px, transparent 1px);
        background-size: 34px 34px;
        animation: drift 22s linear infinite;
      }
      a { color: #f2c76e; text-decoration: none; }
      a:hover { color: #f7ddb0; }
      code {
        background: rgba(7, 16, 21, 0.8);
        color: #f5ddb0;
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid rgba(214, 164, 73, 0.18);
        font-family: var(--mono);
        font-size: 0.88em;
      }
      h1, h2, h3 { color: #f8fafc; }
      p { line-height: 1.55; }
      ul { margin: 0; padding-left: 18px; }
      li { margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(111, 145, 153, 0.18); }
      th {
        color: var(--muted);
        font-family: var(--mono);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .app-shell {
        position: relative;
        z-index: 1;
        max-width: 1680px;
        margin: 0 auto;
        padding: 22px clamp(16px, 3vw, 32px) 48px;
      }
      .command-header {
        position: sticky;
        top: 12px;
        z-index: 30;
        margin-bottom: 22px;
        padding: 22px;
        border-radius: 24px;
        border: 1px solid rgba(214, 164, 73, 0.22);
        background:
          linear-gradient(135deg, rgba(214, 164, 73, 0.1), transparent 28%),
          linear-gradient(180deg, rgba(10, 19, 25, 0.94), rgba(9, 17, 22, 0.88));
        backdrop-filter: blur(18px);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
      }
      .command-header__top {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
        gap: 18px;
        align-items: end;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #f2c76e;
        font-family: var(--mono);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
      }
      .command-header h1 {
        margin: 0;
        font-size: clamp(2rem, 4.3vw, 3.55rem);
        line-height: 0.96;
        letter-spacing: -0.05em;
        max-width: 12ch;
      }
      .lede {
        margin: 14px 0 0;
        max-width: 56ch;
        color: var(--muted);
      }
      .command-rail {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .command-stat {
        min-height: 94px;
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(111, 145, 153, 0.18);
        background: rgba(7, 16, 21, 0.62);
      }
      .command-stat span {
        display: block;
        color: var(--muted);
        font-family: var(--mono);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      .command-stat strong {
        display: block;
        margin-top: 10px;
        font-size: 1.7rem;
        line-height: 1;
      }
      .command-stat small {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.45;
      }
      .section-nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .section-nav a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(214, 164, 73, 0.24);
        background: rgba(9, 16, 21, 0.68);
        color: #f6e3b8;
        font-family: var(--mono);
        font-size: 0.78rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .section-nav a:hover {
        background: rgba(214, 164, 73, 0.12);
        border-color: rgba(214, 164, 73, 0.42);
      }
      .dashboard-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.78fr);
        gap: 22px;
        align-items: start;
      }
      .primary-column, .side-column {
        display: grid;
        gap: 20px;
      }
      .side-column {
        position: sticky;
        top: 180px;
      }
      section {
        margin: 0;
        padding: 18px 20px 20px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, var(--panel-strong), var(--panel));
        position: relative;
        overflow: hidden;
        animation: rise 0.45s ease both;
      }
      section::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(214, 164, 73, 0.55), transparent);
      }
      section h2 {
        margin: 0 0 10px;
        font-size: 0.82rem;
        color: var(--muted);
        font-family: var(--mono);
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }
      section > p:first-of-type {
        color: var(--muted);
      }
      .grid, .device-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 14px;
      }
      .device-grid {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .task-card {
        border: 1px solid rgba(111, 145, 153, 0.18);
        border-radius: 18px;
        padding: 14px 16px;
        background: rgba(7, 16, 21, 0.72);
        transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
      }
      .task-card:hover {
        transform: translateY(-2px);
        border-color: rgba(214, 164, 73, 0.34);
        background: rgba(8, 18, 23, 0.84);
      }
      .task-card h3 { margin-top: 0; }
      .button-row, .task-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .button-row form, .task-buttons form { margin: 0; }
      button {
        border: 1px solid rgba(214, 164, 73, 0.24);
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        cursor: pointer;
        background: linear-gradient(180deg, #ecc677, #cf9c3b);
        color: #1d1608;
        font-weight: 700;
        font-family: var(--sans);
      }
      button:hover { filter: brightness(1.04); }
      button.secondary {
        background: rgba(14, 28, 35, 0.88);
        color: var(--text);
      }
      button.reject {
        background: linear-gradient(180deg, #d77b55, #a9542e);
        color: #fff3ec;
      }
      button:disabled {
        opacity: 0.46;
        cursor: not-allowed;
      }
      .muted { color: var(--muted); }
      .task-meta { margin: 8px 0; color: #cfdbdd; }
      input, textarea, select {
        width: 100%;
        margin-top: 4px;
        margin-bottom: 12px;
        border-radius: 14px;
        border: 1px solid rgba(111, 145, 153, 0.24);
        background: rgba(5, 12, 16, 0.92);
        color: var(--text);
        padding: 10px 12px;
        font-family: var(--sans);
      }
      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: rgba(214, 164, 73, 0.45);
        box-shadow: 0 0 0 3px rgba(214, 164, 73, 0.12);
      }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .status-line {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .status-line span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(111, 145, 153, 0.2);
        background: rgba(7, 16, 21, 0.56);
        color: var(--muted);
        font-family: var(--mono);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .status-line span strong {
        color: var(--text);
        font-size: 0.88rem;
      }
      @keyframes drift {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(0, 18px, 0); }
      }
      @keyframes rise {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 1180px) {
        .command-header {
          position: static;
        }
        .command-header__top,
        .dashboard-layout {
          grid-template-columns: 1fr;
        }
        .side-column {
          position: static;
        }
      }
      @media (max-width: 720px) {
        .app-shell {
          padding: 14px 12px 28px;
        }
        .command-header {
          padding: 16px;
          border-radius: 18px;
        }
        .command-rail {
          grid-template-columns: 1fr;
        }
        section {
          padding: 16px;
          border-radius: 16px;
        }
        .section-nav {
          gap: 8px;
        }
        .section-nav a,
        button {
          min-height: 36px;
        }
      }
    </style>
  </head>
  <body>
    <div class="app-shell">
      <header class="command-header">
        <div class="command-header__top">
          <div>
            <p class="eyebrow">Mission Control / Local Operations</p>
            <h1>Operations board for the live system.</h1>
            <p class="lede">Base44 queues, approvals, councils, and device routes arranged as one operator surface instead of a stack of utility pages.</p>
            <div class="status-line">
              <span><strong>Hub</strong> live on 127.0.0.1:8787</span>
              <span><strong>Tailnet</strong> dhd-admin.tail833d79.ts.net</span>
              <span><strong>Review</strong> ${acknowledgedAlerts}/${base44IntegrityAlerts.length || 0} acknowledged</span>
            </div>
          </div>
          <div class="command-rail">
            ${commandStats
              .map(
                (stat) => `<div class="command-stat">
                  <span>${escapeHtml(stat.label)}</span>
                  <strong>${escapeHtml(stat.value)}</strong>
                  <small>${escapeHtml(stat.detail)}</small>
                </div>`
              )
              .join("")}
          </div>
        </div>
        <nav class="section-nav">
          ${commandNav.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
        </nav>
      </header>

      <div class="dashboard-layout">
        <main class="primary-column">
          <section id="integrity">
      <h2>Integrity Review Queue</h2>
      <p>${base44IntegrityAlerts.length} Base44 integrity alert(s) ready for review.</p>
      ${
        base44IntegrityAlerts.length === 0
          ? "<p class=\"muted\">No IntegrityAlert peek records are available yet. Refresh the Tim app card to pull them in.</p>"
          : `<div class="device-grid">${base44IntegrityAlerts
              .map((alert) => renderIntegrityAlertCard(alert, options.interactive))
              .join("")}</div>`
      }
          </section>

          <section id="evidence">
      <h2>Evidence Package Queue</h2>
      <p>${base44EvidencePackages.length} Base44 evidence package record(s) available.</p>
      ${
        base44EvidencePackages.length === 0
          ? "<p class=\"muted\">No unfiltered EvidencePackage peek records are available yet. Use the Base44 card to refresh evidence packages.</p>"
          : `<div class="device-grid">${base44EvidencePackages.map(renderEvidencePackageCard).join("")}</div>`
      }
          </section>

          <section id="base44">
      <h2>Base44 Control Surface</h2>
      <p>Latest live Base44 inventory and peek snapshots discovered in <code>.mission-control/data</code>.</p>
      ${
        base44Apps.length === 0
          ? "<p class=\"muted\">No Base44 snapshots have been collected yet.</p>"
          : `<div class="device-grid">${base44Apps.map((app) => renderBase44AppCard(app, options.interactive)).join("")}</div>`
      }
          </section>

          <section id="ai-memory">
      <h2>Agent Roles / AI Memory</h2>
      ${renderAiMemoryOverview(aiMemoryOverview)}
          </section>

          <section id="systems">
      <h2>Devices</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>Platform</th><th>Last Seen</th><th>Permissions</th></tr>
        </thead>
        <tbody>
          ${devices
            .map(
              (device) => `<tr>
                <td>${escapeHtml(device.displayName)}</td>
                <td>${escapeHtml(device.platform)}</td>
                <td>${escapeHtml(device.lastSeenAt)}</td>
                <td><code>${escapeHtml(
                  `${device.permissions.taskExecution}, shell=${device.permissions.shell}, desktop=${device.permissions.desktopControl}`
                )}</code></td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
          </section>

          <section>
      <h2>Node Registry</h2>
      ${
        options.interactive
          ? `<form method="post" action="/actions/nodes">
              <div class="task-meta">Register machines, apps, mobile devices, or partially integrated nodes on the network.</div>
              <div class="form-grid">
                <label>Node id<br /><input name="nodeId" required placeholder="proliant-ubuntu" /></label>
                <label>Label<br /><input name="label" required placeholder="ProLiant Ubuntu Server" /></label>
                <label>Kind<br />
                  <select name="kind">
                    <option value="machine">machine</option>
                    <option value="server">server</option>
                    <option value="mobile">mobile</option>
                    <option value="wearable">wearable</option>
                    <option value="agent">agent</option>
                    <option value="app">app</option>
                  </select>
                </label>
                <label>Status<br />
                  <select name="status">
                    <option value="discovered">discovered</option>
                    <option value="reachable">reachable</option>
                    <option value="partial" selected>partial</option>
                    <option value="active">active</option>
                    <option value="offline">offline</option>
                  </select>
                </label>
                <label>Platform<br /><input name="platform" required placeholder="ubuntu" /></label>
                <label>Linked device id<br /><input name="linkedDeviceId" placeholder="linux-home-server" /></label>
              </div>
              <div class="form-grid">
                <label>Linked node ids<br /><input name="linkedNodeIds" placeholder="galaxy-s25, galaxy-watch-8" /></label>
                <label>Agent surfaces<br /><input name="agentSurfaces" placeholder="cursor, mission-control-agent" /></label>
                <label>Capabilities<br /><input name="capabilities" placeholder="ssh, logs, council" /></label>
                <label>Tags<br /><input name="tags" placeholder="tailscale, partial, proliant" /></label>
              </div>
              <div class="form-grid">
                <label>Tailscale<br /><select name="tailscale"><option value="true">true</option><option value="false">false</option></select></label>
                <label>SSH<br /><select name="ssh"><option value="true">true</option><option value="false">false</option></select></label>
                <label>Local agent<br /><select name="localAgent"><option value="false">false</option><option value="true">true</option></select></label>
                <label>Companion link<br /><select name="companion"><option value="false">false</option><option value="true">true</option></select></label>
              </div>
              <label>Reachability notes<br /><textarea name="reachabilityNotes" rows="2" placeholder="reachable on tailnet&#10;ssh not wired yet"></textarea></label>
              <label>Notes<br /><textarea name="notes" rows="2" placeholder="partial integration&#10;ubuntu on ProLiant"></textarea></label>
              <div class="button-row">
                <button type="submit">Save Node</button>
              </div>
            </form>`
          : "<p class=\"muted\">Node registration stays available through the JSON API when token protection is enabled.</p>"
      }
      ${
        nodes.length === 0
          ? "<p class=\"muted\">No nodes are registered yet.</p>"
          : `<div class="device-grid">${nodes.map(renderNodeCard).join("")}</div>`
      }
          </section>

          <section>
      <h2>Connection Links</h2>
      ${
        options.interactive
          ? `<form method="post" action="/actions/links">
              <div class="task-meta">Track actual cross-system paths such as Tailscale discovery, SSH setup, or local agent bridges.</div>
              <div class="form-grid">
                <label>Link id<br /><input name="linkId" required placeholder="dell-to-main-ssh" /></label>
                <label>Label<br /><input name="label" required placeholder="Dell 2-in-1 to main machine over SSH" /></label>
                <label>Source node id<br /><input name="sourceNodeId" required placeholder="dell-2in1" /></label>
                <label>Target node id<br /><input name="targetNodeId" required placeholder="windows-main" /></label>
              </div>
              <div class="form-grid">
                <label>Transport<br />
                  <select name="transport">
                    <option value="ssh">ssh</option>
                    <option value="tailscale">tailscale</option>
                    <option value="local-agent">local-agent</option>
                    <option value="companion">companion</option>
                    <option value="http">http</option>
                  </select>
                </label>
                <label>Status<br />
                  <select name="status">
                    <option value="planned">planned</option>
                    <option value="attempting" selected>attempting</option>
                    <option value="reachable">reachable</option>
                    <option value="verified">verified</option>
                    <option value="blocked">blocked</option>
                    <option value="offline">offline</option>
                  </select>
                </label>
              </div>
              <label>Notes<br /><textarea name="notes" rows="2" placeholder="SSH host setup in progress&#10;Tailscale path exists"></textarea></label>
              <div class="button-row">
                <button type="submit">Save Link</button>
              </div>
            </form>`
          : "<p class=\"muted\">Link registration stays available through the JSON API when token protection is enabled.</p>"
      }
      ${
        links.length === 0
          ? "<p class=\"muted\">No connection links are registered yet.</p>"
          : `<div class="device-grid">${links.map((link) => renderLinkCard(link, state.nodes)).join("")}</div>`
      }
          </section>

          <section id="actions">
      <h2>Request Named Tasks</h2>
      ${
        options.interactive
          ? ""
          : "<p class=\"muted\">Dashboard task actions are disabled while MISSION_CONTROL_TOKEN is enabled. Use the JSON API with a bearer token for mutations.</p>"
      }
      <div class="device-grid">
        ${
          devices.length === 0
            ? "<p class=\"muted\">No devices are registered yet.</p>"
            : devices.map((device) => renderTaskCatalog(device.deviceId, device.displayName, device.taskCatalog, options.interactive)).join("")
        }
      </div>
    </section>

    <section>
      <h2>Approval Queue</h2>
      <p>${pendingApprovals.length} task(s) awaiting approval.</p>
      ${
        pendingApprovals.length === 0
          ? "<p class=\"muted\">No approvals are waiting right now.</p>"
          : pendingApprovals.map((task) => renderPendingApproval(task, options.interactive)).join("")
      }
    </section>

    <section>
      <h2>Recent Tasks</h2>
      ${
        recentTasks.length === 0
          ? "<p class=\"muted\">No task requests have been recorded yet.</p>"
          : `<ul>${recentTasks.map(renderRecentTask).join("")}</ul>`
      }
          </section>

          <section id="council">
      <h2>Council Bridge</h2>
      ${
        options.interactive
          ? `<form method="post" action="/actions/council/sessions">
              <div class="task-meta">Open a coordination thread for multiple machines, apps, or agents.</div>
              <div class="form-grid">
                <label>Topic<br /><input name="topic" required /></label>
                <label>Requested by<br /><input name="requestedBy" value="dashboard" /></label>
              </div>
              <label>Target members (comma-separated ids)<br /><input name="targetMemberIds" placeholder="windows-main, linux-home-server, cursor-agent" /></label>
              <label>Prompt<br /><textarea name="prompt" rows="4" required placeholder="Ask the council what should happen next."></textarea></label>
              <div class="button-row">
                <button type="submit">Open Council Session</button>
              </div>
            </form>`
          : "<p class=\"muted\">Council sessions can still be created and answered through the JSON API when token protection is enabled.</p>"
      }
      ${
        councilSessions.length === 0
          ? "<p class=\"muted\">No council sessions yet.</p>"
          : councilSessions.map((session) => renderCouncilSession(session, options.interactive)).join("")
      }
          </section>

          <section>
      <h2>Peer Inbox</h2>
      ${
        options.interactive
          ? `<form method="post" action="/actions/inbox">
              <div class="form-grid">
                <label>Role<br />
                  <select name="role">
                    <option value="codex">codex</option>
                    <option value="cursor">cursor</option>
                    <option value="human">human</option>
                  </select>
                </label>
              </div>
              <label>Message<br /><textarea name="text" rows="3" required placeholder="Send a bridge message to other agents or operators."></textarea></label>
              <div class="button-row">
                <button type="submit">Send Message</button>
                <button type="button" class="secondary" onclick="window.location.reload()">Refresh</button>
              </div>
            </form>`
          : "<p class=\"muted\">Peer inbox writes stay available through /v1/inbox when token protection is enabled.</p>"
      }
      ${
        inboxMessages.length === 0
          ? "<p class=\"muted\">No peer messages yet.</p>"
          : `<ul>${inboxMessages
              .map(
                (message) =>
                  `<li><strong>${escapeHtml(message.role)}</strong> <span class="muted">${escapeHtml(message.ts)}</span><br />${escapeHtml(
                    message.text
                  )}</li>`
              )
              .join("")}</ul>`
      }
          </section>

          <section>
      <h2>Desktop Control Readiness</h2>
      <p><strong>${escapeHtml(state.desktopControlEvaluation?.recommendation ?? "not_ready")}</strong></p>
      <ul>${renderList(state.desktopControlEvaluation?.reasons ?? [])}</ul>
          </section>
        </main>

        <aside class="side-column">
          <section>
            <h2>Access</h2>
            <ul>
              <li>Local dashboard: <a href="http://127.0.0.1:8787/"><code>http://127.0.0.1:8787/</code></a></li>
              <li>Tailnet dashboard: <code>http://dhd-admin.tail833d79.ts.net:8787/</code></li>
              <li>Discovery manifest: <code>http://dhd-admin.tail833d79.ts.net:8787/.well-known/mission-control.json</code></li>
            </ul>
          </section>

          <section>
            <h2>Live Summary</h2>
            <ul>${renderList(snapshot.deviceSummaries)}</ul>
          </section>

          <section>
            <h2>Attention</h2>
            <ul>${renderList(snapshot.attention)}</ul>
          </section>

          <section>
            <h2>Suggested Actions</h2>
            <ul>${renderList(snapshot.suggestedActions)}</ul>
          </section>

          <section>
            <h2>Silent Loop</h2>
            <ul>${renderList(snapshot.silentLoop)}</ul>
          </section>

          <section>
            <h2>Notes</h2>
            <ul>${renderList(snapshot.notes)}</ul>
          </section>
        </aside>
      </div>
    </div>
    <script>
      document.body.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("[data-copy-council]");
        if (!btn) return;
        var id = btn.getAttribute("data-copy-council");
        if (!id) return;
        var u = new URL("/api/council/sessions/" + encodeURIComponent(id), window.location.origin);
        navigator.clipboard.writeText(u.href).then(function () {
          var prev = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(function () { btn.textContent = prev; }, 1500);
        }).catch(function () { window.alert("Copy failed"); });
      });
    </script>
  </body>
</html>`;
}

function renderAiMemoryRecordList(records: AiMemoryRecord[]): string {
  if (records.length === 0) {
    return "<p class=\"muted\">No records yet.</p>";
  }

  return `<ul>${records
    .slice(0, 5)
    .map((record) => {
      const summary = record.summary ? ` - ${escapeHtml(record.summary)}` : "";
      return `<li><strong>${escapeHtml(record.title)}</strong> <span class="muted">${escapeHtml(record.updatedAt)}</span>${summary}</li>`;
    })
    .join("")}</ul>`;
}

function renderAiMemoryOverview(overview: AiMemoryOverview): string {
  const roleCards = overview.roles
    .map(
      (role) => `<div class="task-card">
        <div><strong>${escapeHtml(role.name)}</strong></div>
        <div class="task-meta">${escapeHtml(role.purpose)}</div>
      </div>`
    )
    .join("");
  const currentSummary = overview.currentState?.summary ?? "No current-state summary found.";
  const projectSummary = overview.projectContext?.summary ?? "No project-context summary found.";

  return `<p>Default loop: <code>${escapeHtml(overview.defaultLoop.join(" -> "))}</code></p>
    <div class="grid">
      <div class="task-card">
        <h3>Current State</h3>
        <p>${escapeHtml(currentSummary)}</p>
        <p class="muted">${overview.currentState ? escapeHtml(overview.currentState.path) : "docs/ai/current-state.md missing"}</p>
      </div>
      <div class="task-card">
        <h3>Project Context</h3>
        <p>${escapeHtml(projectSummary)}</p>
        <p class="muted">${overview.projectContext ? escapeHtml(overview.projectContext.path) : "docs/ai/project-context.md missing"}</p>
      </div>
    </div>
    <div class="task-meta"><strong>Active roles</strong></div>
    <div class="grid">${roleCards}</div>
    <div class="grid" style="margin-top:14px;">
      <div class="task-card">
        <h3>Decision Records</h3>
        ${renderAiMemoryRecordList(overview.records.decision)}
      </div>
      <div class="task-card">
        <h3>Handoffs</h3>
        ${renderAiMemoryRecordList(overview.records.handoff)}
      </div>
      <div class="task-card">
        <h3>Runbooks</h3>
        ${renderAiMemoryRecordList(overview.records.runbook)}
      </div>
    </div>`;
}

function renderTaskCatalog(
  deviceId: string,
  displayName: string,
  taskCatalog: HubState["devices"][string]["taskCatalog"],
  interactive: boolean
): string {
  return `<div class="task-card">
    <h3>${escapeHtml(displayName)}</h3>
    <p class="muted"><code>${escapeHtml(deviceId)}</code></p>
    ${
      taskCatalog.length === 0
        ? "<p class=\"muted\">This device has not published any named tasks yet.</p>"
        : taskCatalog
            .map(
              (task) => `<form method="post" action="/actions/task-requests">
                <input type="hidden" name="deviceId" value="${escapeHtml(deviceId)}" />
                <input type="hidden" name="taskId" value="${escapeHtml(task.id)}" />
                <input type="hidden" name="requestedBy" value="dashboard" />
                <div><strong>${escapeHtml(task.title)}</strong></div>
                <div class="task-meta">${escapeHtml(task.description)}</div>
                <div class="muted">Approval: ${task.requiresApproval ? "required" : "policy-based"}</div>
                <div class="task-buttons">
                  <button type="submit"${interactive ? "" : " disabled"}>Request ${escapeHtml(task.title)}</button>
                </div>
              </form>`
            )
            .join("")
    }
  </div>`;
}

function renderPendingApproval(task: TaskRequest, interactive: boolean): string {
  return `<div class="task-card">
    <div><strong>${escapeHtml(task.taskId)}</strong> for <code>${escapeHtml(task.deviceId)}</code></div>
    <div class="task-meta">Requested by ${escapeHtml(task.requestedBy)} at ${escapeHtml(task.requestedAt)}</div>
    <form method="post" action="/actions/task-requests/${encodeURIComponent(task.id)}/decision">
      <input type="hidden" name="actor" value="dashboard" />
      <div class="button-row">
        <button type="submit" name="approved" value="true"${interactive ? "" : " disabled"}>Approve</button>
        <button type="submit" class="reject" name="approved" value="false"${interactive ? "" : " disabled"}>Reject</button>
      </div>
    </form>
  </div>`;
}

function renderRecentTask(task: TaskRequest): string {
  const detail = task.resultSummary ? ` - ${escapeHtml(task.resultSummary)}` : "";
  return `<li><code>${escapeHtml(task.deviceId)}</code> <strong>${escapeHtml(task.taskId)}</strong> is ${escapeHtml(
    task.status
  )}${detail}</li>`;
}

function renderNodeCard(node: HubState["nodes"][string]): string {
  const surfaces = node.agentSurfaces.length > 0 ? node.agentSurfaces.join(", ") : "none";
  const reachability = [
    node.reachability.tailscale ? "tailscale" : undefined,
    node.reachability.ssh ? "ssh" : undefined,
    node.reachability.localAgent ? "local-agent" : undefined,
    node.reachability.companion ? "companion" : undefined
  ]
    .filter(Boolean)
    .join(", ");

  return `<div class="task-card">
    <div><strong>${escapeHtml(node.label)}</strong> <span class="muted">(${escapeHtml(node.kind)} / ${escapeHtml(node.status)})</span></div>
    <div class="task-meta"><code>${escapeHtml(node.nodeId)}</code> on ${escapeHtml(node.platform)}</div>
    <div class="task-meta">Surfaces: ${escapeHtml(surfaces)}</div>
    <div class="task-meta">Reachability: ${escapeHtml(reachability || "unknown")}</div>
    ${node.linkedDeviceId ? `<div class="task-meta">Linked device: <code>${escapeHtml(node.linkedDeviceId)}</code></div>` : ""}
    ${node.notes.length > 0 ? `<ul>${node.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function renderLinkCard(link: HubState["links"][string], nodes: HubState["nodes"]): string {
  const sourceLabel = nodes[link.sourceNodeId]?.label ?? link.sourceNodeId;
  const targetLabel = nodes[link.targetNodeId]?.label ?? link.targetNodeId;
  const routeQuality = extractRouteQuality(link.notes);
  const routeBadge =
    link.transport === "tailscale"
      ? routeQuality === "direct"
        ? renderStatusBadge("direct", "good")
        : routeQuality === "relay"
          ? renderStatusBadge("relay", "warn")
          : renderStatusBadge("route unknown", "muted")
      : "";

  return `<div class="task-card">
    <div><strong>${escapeHtml(link.label)}</strong> <span class="muted">(${escapeHtml(link.transport)} / ${escapeHtml(link.status)})</span></div>
    <div class="task-meta"><code>${escapeHtml(link.linkId)}</code></div>
    <div class="task-meta">${escapeHtml(sourceLabel)} -> ${escapeHtml(targetLabel)}</div>
    ${routeBadge ? `<div class="task-meta">Route: ${routeBadge}</div>` : ""}
    ${link.lastCheckedAt ? `<div class="task-meta">Last checked: ${escapeHtml(link.lastCheckedAt)}</div>` : ""}
    ${link.notes.length > 0 ? `<ul>${link.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function renderCouncilSession(session: CouncilSession, interactive: boolean): string {
  const targetMembers = session.targetMemberIds.length > 0 ? session.targetMemberIds.join(", ") : "open council";
  const responses =
    session.responses.length === 0
      ? "<li>No responses yet.</li>"
      : session.responses
          .map(
            (response) =>
              `<li><strong>${escapeHtml(response.memberLabel)}</strong> (${escapeHtml(response.stance)}): ${escapeHtml(response.summary)}</li>`
          )
          .join("");

  return `<div class="task-card">
    <div><strong>${escapeHtml(session.topic)}</strong> <span class="muted">(${escapeHtml(session.status)})</span></div>
    <div class="task-meta">Requested by ${escapeHtml(session.requestedBy)} for ${escapeHtml(targetMembers)}</div>
    <div class="task-meta">${escapeHtml(session.prompt)}</div>
    <ul>${responses}</ul>
    <div class="button-row">
      <button type="button" class="secondary" data-copy-council="${escapeHtml(session.id)}">Copy session GET URL</button>
    </div>
    ${
      interactive && session.status === "open"
        ? `<form method="post" action="/actions/council/sessions/${encodeURIComponent(session.id)}/close">
            <div class="button-row">
              <button type="submit" class="secondary">Close Session</button>
            </div>
          </form>`
        : ""
    }
  </div>`;
}

function renderIntegrityAlertCard(alert: Base44IntegrityAlert, interactive: boolean): string {
  const updated = alert.updated_date ?? alert.created_date ?? alert.checkedAt;
  const statusBadge = renderStatusBadge(alert.status ?? "unknown", normalizeBadgeTone(alert.status));
  const severityBadge = renderStatusBadge(alert.severity ?? "unknown", normalizeBadgeTone(alert.severity));
  const appLabel = alert.appId.length > 12 ? `${alert.appId.slice(0, 12)}...` : alert.appId;
  const acknowledgedBadge = alert.acknowledgedAt
    ? renderStatusBadge(`acknowledged ${alert.acknowledgedBy ?? "operator"}`, "good")
    : "";
  const evidenceBadge =
    (alert.evidencePackageCount ?? 0) > 0
      ? renderStatusBadge(`${alert.evidencePackageCount} package${alert.evidencePackageCount === 1 ? "" : "s"}`, "good")
      : renderStatusBadge("no package", "muted");
  const evidenceList =
    alert.linkedEvidencePackages && alert.linkedEvidencePackages.length > 0
      ? `<ul>${alert.linkedEvidencePackages
          .map((pkg) => {
            const packageLabel = pkg.package_id ?? pkg.id ?? "unlabeled-package";
            const status = pkg.package_status ? ` (${escapeHtml(pkg.package_status)})` : "";
            const confidential = pkg.confidential === "true" ? " confidential" : "";
            return `<li><code>${escapeHtml(packageLabel)}</code>${status}${confidential}</li>`;
          })
          .join("")}</ul>`
      : '<p class="muted">No linked evidence package found yet.</p>';

  return `<div class="task-card">
    <div class="button-row">
      ${severityBadge}
      ${statusBadge}
      ${acknowledgedBadge}
      ${evidenceBadge}
    </div>
    <div class="task-meta"><strong>${escapeHtml(alert.alert_type ?? "IntegrityAlert")}</strong> <span class="muted">(${escapeHtml(alert.id ?? "no-id")})</span></div>
    <div class="task-meta">${escapeHtml(alert.signal_summary ?? "No summary captured.")}</div>
    <div class="task-meta">Updated: ${escapeHtml(updated)}</div>
    <div class="task-meta">App: <code>${escapeHtml(appLabel)}</code></div>
    <div class="task-meta"><strong>Linked evidence</strong></div>
    ${evidenceList}
    <div class="button-row">
      <form method="post" action="/actions/base44/integrity-alerts/acknowledge">
        <input type="hidden" name="appId" value="${escapeHtml(alert.appId)}" />
        <input type="hidden" name="alertId" value="${escapeHtml(alert.id ?? "")}" />
        <input type="hidden" name="alertType" value="${escapeHtml(alert.alert_type ?? "")}" />
        <input type="hidden" name="signalSummary" value="${escapeHtml(alert.signal_summary ?? "")}" />
        <input type="hidden" name="actor" value="dashboard" />
        <button type="submit"${interactive && alert.id && !alert.acknowledgedAt ? "" : " disabled"}>Acknowledge</button>
      </form>
      <form method="post" action="/actions/base44/integrity-alerts/open-council">
        <input type="hidden" name="alertId" value="${escapeHtml(alert.id ?? "")}" />
        <input type="hidden" name="alertType" value="${escapeHtml(alert.alert_type ?? "")}" />
        <input type="hidden" name="status" value="${escapeHtml(alert.status ?? "")}" />
        <input type="hidden" name="severity" value="${escapeHtml(alert.severity ?? "")}" />
        <input type="hidden" name="signalSummary" value="${escapeHtml(alert.signal_summary ?? "")}" />
        <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Open Council</button>
      </form>
      <form method="post" action="/actions/base44/integrity-alerts/evidence-check">
        <input type="hidden" name="appId" value="${escapeHtml(alert.appId)}" />
        <input type="hidden" name="apiBase" value="${escapeHtml(alert.apiBase)}" />
        <input type="hidden" name="alertId" value="${escapeHtml(alert.id ?? "")}" />
        <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Evidence Check</button>
      </form>
      <form method="post" action="/actions/base44/peek-refresh">
        <input type="hidden" name="appId" value="${escapeHtml(alert.appId)}" />
        <input type="hidden" name="apiBase" value="${escapeHtml(alert.apiBase)}" />
        <input type="hidden" name="entity" value="IntegrityAlert" />
        <input type="hidden" name="fields" value="alert_type,status,signal_summary,severity" />
        <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Refresh Peek</button>
      </form>
    </div>
  </div>`;
}

function renderEvidencePackageCard(pkg: Base44EvidencePackage): string {
  const updated = pkg.updated_date ?? pkg.created_date ?? pkg.checkedAt;
  const statusBadge = renderStatusBadge(pkg.package_status ?? "unknown", normalizeBadgeTone(pkg.package_status));
  const confidentialBadge =
    pkg.confidential === "true" ? renderStatusBadge("confidential", "warn") : pkg.confidential === "false" ? "" : "";
  const appLabel = pkg.appId.length > 12 ? `${pkg.appId.slice(0, 12)}...` : pkg.appId;

  return `<div class="task-card">
    <div class="button-row">
      ${statusBadge}
      ${confidentialBadge}
    </div>
    <div class="task-meta"><strong>${escapeHtml(pkg.package_id ?? "EvidencePackage")}</strong> <span class="muted">(${escapeHtml(pkg.id ?? "no-id")})</span></div>
    <div class="task-meta">Updated: ${escapeHtml(updated)}</div>
    <div class="task-meta">Alert: <code>${escapeHtml(pkg.alert_id ?? "unlinked")}</code></div>
    ${pkg.retention_until ? `<div class="task-meta">Retention until: ${escapeHtml(pkg.retention_until)}</div>` : ""}
    <div class="task-meta">App: <code>${escapeHtml(appLabel)}</code></div>
  </div>`;
}

function renderBase44AppCard(app: Base44AppSnapshot, interactive: boolean): string {
  const defaultPeek = app.latestPeeks[0];
  const defaultEntity = defaultPeek?.entity ?? "IntegrityAlert";
  const defaultFields = defaultPeek?.requestedFields?.join(",") ?? "";
  const defaultQuery = defaultPeek?.query ? JSON.stringify(defaultPeek.query) : "";
  const inventoryItems =
    app.latestInventory?.populatedEntities.length
      ? `<ul>${app.latestInventory.populatedEntities
          .slice(0, 8)
          .map((entry) => {
            const latest = entry.latestUpdated ? ` latest ${escapeHtml(entry.latestUpdated)}` : "";
            const summary = entry.topSummary ? ` - ${escapeHtml(entry.topSummary)}` : "";
            const error = entry.error ? ` - ${escapeHtml(entry.error)}` : "";
            return `<li><strong>${escapeHtml(entry.entity)}</strong> (${entry.fetched})${latest}${summary}${error}</li>`;
          })
          .join("")}</ul>`
      : "<p class=\"muted\">No populated inventory entities captured yet.</p>";

  const peekItems =
    app.latestPeeks.length > 0
      ? `<ul>${app.latestPeeks
          .slice(0, 6)
          .map((peek) => {
            const preview =
              peek.topPreview && Object.keys(peek.topPreview).length > 0
                ? ` - ${escapeHtml(JSON.stringify(peek.topPreview))}`
                : "";
            const fields = peek.requestedFields?.join(",") ?? "";
            const query = peek.query ? JSON.stringify(peek.query) : "";
            return `<li><strong>${escapeHtml(peek.entity)}</strong> (${peek.fetched}) <span class="muted">${escapeHtml(
              peek.checkedAt
            )}</span>${preview}
              <form method="post" action="/actions/base44/peek-refresh" style="margin-top:8px;">
                <input type="hidden" name="appId" value="${escapeHtml(app.appId)}" />
                <input type="hidden" name="apiBase" value="${escapeHtml(app.apiBase)}" />
                <input type="hidden" name="entity" value="${escapeHtml(peek.entity)}" />
                <input type="hidden" name="fields" value="${escapeHtml(fields)}" />
                <input type="hidden" name="query" value="${escapeHtml(query)}" />
                <input type="hidden" name="limit" value="5" />
                <div class="button-row">
                  <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Refresh ${escapeHtml(peek.entity)} Peek</button>
                </div>
              </form>
            </li>`;
          })
          .join("")}</ul>`
      : "<p class=\"muted\">No entity peeks captured yet.</p>";

  return `<div class="task-card">
    <div><strong>Base44 App</strong> <span class="muted">(${escapeHtml(app.appId)})</span></div>
    <div class="task-meta">${escapeHtml(app.apiBase)}</div>
    <div class="task-meta">Last seen: ${escapeHtml(app.lastSeenAt)}</div>
    <div class="task-meta">Snapshots: ${app.snapshotCount}</div>
    <div class="task-meta">Env sources: ${escapeHtml(app.envSources.join(", ") || "unknown")}</div>
    <div class="button-row">
      <form method="post" action="/actions/base44/inventory-refresh">
        <input type="hidden" name="appId" value="${escapeHtml(app.appId)}" />
        <input type="hidden" name="apiBase" value="${escapeHtml(app.apiBase)}" />
        <input type="hidden" name="limit" value="3" />
        <button type="submit"${interactive ? "" : " disabled"}>Refresh Inventory</button>
      </form>
      <form method="post" action="/actions/base44/peek-refresh">
        <input type="hidden" name="appId" value="${escapeHtml(app.appId)}" />
        <input type="hidden" name="apiBase" value="${escapeHtml(app.apiBase)}" />
        <input type="hidden" name="entity" value="EvidencePackage" />
        <input type="hidden" name="fields" value="package_id,package_status,alert_id,retention_until,confidential" />
        <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Refresh Evidence Packages</button>
      </form>
    </div>
    <div class="task-meta"><strong>Inventory</strong>${app.latestInventory ? ` <span class="muted">${escapeHtml(app.latestInventory.checkedAt)}</span>` : ""}</div>
    ${inventoryItems}
    <div class="task-meta"><strong>Latest peeks</strong></div>
    ${peekItems}
    <form method="post" action="/actions/base44/peek-refresh">
      <input type="hidden" name="appId" value="${escapeHtml(app.appId)}" />
      <input type="hidden" name="apiBase" value="${escapeHtml(app.apiBase)}" />
      <div class="form-grid">
        <label>Peek entity<br /><input name="entity" value="${escapeHtml(defaultEntity)}" /></label>
        <label>Fields<br /><input name="fields" value="${escapeHtml(defaultFields)}" placeholder="status,signal_summary" /></label>
      </div>
      <label>Query JSON<br /><input name="query" value="${escapeHtml(defaultQuery)}" placeholder='{"status":"new"}' /></label>
      <div class="button-row">
        <button type="submit" class="secondary"${interactive ? "" : " disabled"}>Refresh Custom Peek</button>
      </div>
    </form>
  </div>`;
}
