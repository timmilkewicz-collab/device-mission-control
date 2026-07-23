import fs from "node:fs";
import { nodeIdentityPolicy } from "../domain/fleet/nodeIdentityPolicy";
import { appendDomainEvent } from "../infrastructure/events/domainEventLog";
import { HubState, hubStateSchema } from "../shared/types";

export function reconcileNodeIdentityOnDisk(statePath: string): HubState {
  if (!fs.existsSync(statePath)) {
    throw new Error(`Hub state not found: ${statePath}`);
  }

  const current = hubStateSchema.parse(JSON.parse(fs.readFileSync(statePath, "utf8")));
  const reconciliation = nodeIdentityPolicy.reconcileGoliathAliases(current);

  fs.writeFileSync(statePath, JSON.stringify(reconciliation.state, null, 2), "utf8");

  if (reconciliation.reconciled && reconciliation.canonicalNodeId && reconciliation.legacyNodeId) {
    appendDomainEvent({
      type: "NodeIdentityReconciled",
      at: new Date().toISOString(),
      canonicalNodeId: reconciliation.canonicalNodeId,
      legacyNodeId: reconciliation.legacyNodeId
    });
  }

  return reconciliation.state;
}
