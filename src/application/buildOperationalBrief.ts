import { DesktopControlEvaluation, HubState, PlanSnapshot } from "../shared/types";
import { evaluateDesktopControlReadiness } from "../domain/tasks/desktopControlReadinessPolicy";
import { buildPlanSnapshot } from "../hub/operationalPlanner";

export type OperationalBrief = {
  plan: PlanSnapshot;
  desktopControl: DesktopControlEvaluation;
};

export function buildOperationalBrief(state: HubState): OperationalBrief {
  return {
    plan: buildPlanSnapshot(state),
    desktopControl: evaluateDesktopControlReadiness(state)
  };
}
