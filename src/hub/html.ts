import { CouncilSession, HubState, PlanSnapshot, TaskRequest } from "../shared/types";

type DashboardOptions = {
  interactive: boolean;
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

export function renderDashboard(state: HubState, snapshot: PlanSnapshot, options: DashboardOptions): string {
  const nodes = Object.values(state.nodes).sort((left, right) => left.label.localeCompare(right.label));
  const devices = Object.values(state.devices);
  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  const recentTasks = [...state.taskRequests].slice(-8).reverse();
  const councilSessions = [...state.councilSessions].slice(-6).reverse();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Device Mission Control</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
      h1, h2 { color: #f8fafc; }
      section { margin-bottom: 24px; padding: 16px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
      code { background: #1e293b; padding: 2px 6px; border-radius: 6px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
      .device-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
      li { margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 8px; border-bottom: 1px solid #334155; }
      .task-card { border: 1px solid #334155; border-radius: 12px; padding: 12px; background: #0f172a; }
      .task-card h3 { margin-top: 0; }
      .button-row, .task-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      button { border: 0; border-radius: 8px; padding: 8px 12px; cursor: pointer; background: #38bdf8; color: #082f49; font-weight: 700; }
      button.secondary { background: #334155; color: #e2e8f0; }
      button.reject { background: #f97316; color: #431407; }
      .muted { color: #94a3b8; }
      .task-meta { margin: 8px 0; color: #cbd5e1; }
      input, textarea { width: 100%; box-sizing: border-box; margin-top: 4px; margin-bottom: 12px; border-radius: 8px; border: 1px solid #475569; background: #020617; color: #e2e8f0; padding: 8px 10px; }
      select { width: 100%; box-sizing: border-box; margin-top: 4px; margin-bottom: 12px; border-radius: 8px; border: 1px solid #475569; background: #020617; color: #e2e8f0; padding: 8px 10px; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    </style>
  </head>
  <body>
    <h1>Device Mission Control</h1>
    <p>Observer-first dashboard for notes, plans, and approval-gated tasks.</p>

    <section>
      <h2>Live Summary</h2>
      <ul>${renderList(snapshot.deviceSummaries)}</ul>
    </section>

    <div class="grid">
      <section>
        <h2>Attention</h2>
        <ul>${renderList(snapshot.attention)}</ul>
      </section>

      <section>
        <h2>Suggested Actions</h2>
        <ul>${renderList(snapshot.suggestedActions)}</ul>
      </section>
    </div>

    <section>
      <h2>Notes</h2>
      <ul>${renderList(snapshot.notes)}</ul>
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

    <section>
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
      <h2>Desktop Control Readiness</h2>
      <p><strong>${escapeHtml(state.desktopControlEvaluation?.recommendation ?? "not_ready")}</strong></p>
      <ul>${renderList(state.desktopControlEvaluation?.reasons ?? [])}</ul>
    </section>
  </body>
</html>`;
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
