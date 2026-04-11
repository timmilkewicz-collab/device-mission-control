import { HubState, PlanSnapshot } from "../shared/types";

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

export function renderDashboard(state: HubState, snapshot: PlanSnapshot): string {
  const devices = Object.values(state.devices);
  const pendingApprovals = state.taskRequests.filter((task) => task.status === "pending");

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
      li { margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 8px; border-bottom: 1px solid #334155; }
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
      <h2>Approval Queue</h2>
      <p>${pendingApprovals.length} task(s) awaiting approval.</p>
      <ul>
        ${pendingApprovals
          .map(
            (task) =>
              `<li><code>${escapeHtml(task.deviceId)}</code> wants <code>${escapeHtml(task.taskId)}</code> requested by ${escapeHtml(
                task.requestedBy
              )}</li>`
          )
          .join("") || "<li>None</li>"}
      </ul>
    </section>

    <section>
      <h2>Desktop Control Readiness</h2>
      <p><strong>${escapeHtml(state.desktopControlEvaluation?.recommendation ?? "not_ready")}</strong></p>
      <ul>${renderList(state.desktopControlEvaluation?.reasons ?? [])}</ul>
    </section>
  </body>
</html>`;
}
