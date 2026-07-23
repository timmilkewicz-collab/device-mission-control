import fs from "node:fs";
import { reconcileNodeIdentityOnDisk } from "../application/reconcileNodeIdentity";

export function applyGoliathIdentityReconciliation(statePath: string) {
  return reconcileNodeIdentityOnDisk(statePath);
}
