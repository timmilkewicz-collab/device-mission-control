import { HubState, PlanSnapshot, TaskRequest } from "../shared/types";

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
  const devices = Object.values(state.devices);
  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");
  const recentTasks = [...state.taskRequests].slice(-8).reverse();

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
