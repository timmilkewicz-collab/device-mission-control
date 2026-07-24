import fs from "node:fs";
import path from "node:path";
import {
  policyAdoptionObservationSchema,
  type PolicyAdoptionObservation,
  type PolicyAdoptionStatus,
  type PolicyAdoptionSummary
} from "../../shared/policyAdoptionObservation";

export type LoadPolicyAdoptionOptions = {
  /** Explicit path to sanitized observation JSON */
  filePath?: string;
  /** Optional search roots (repo-relative or absolute) */
  searchPaths?: string[];
  env?: NodeJS.ProcessEnv;
};

const EMPTY_COUNTS: Record<PolicyAdoptionStatus, number> = {
  current: 0,
  outdated: 0,
  "pending-review": 0,
  drifted: 0
};

/**
 * Read-only loader for Council policy adoption observations.
 * Does not write, merge, or approve context packs.
 */
export function resolvePolicyAdoptionObservationPath(
  options: LoadPolicyAdoptionOptions = {}
): string | null {
  if (options.filePath) {
    return options.filePath;
  }

  const env = options.env ?? process.env;
  const fromEnv = env.COUNCIL_POLICY_ADOPTION_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const candidates = options.searchPaths ?? [
    path.resolve(process.cwd(), "data", "policy-adoption-observation.json"),
    path.resolve(
      process.cwd(),
      "..",
      "council-context-control-plane",
      "exports",
      "mission-control",
      "policy-adoption-observation.sample.json"
    ),
    path.resolve(
      "C:\\Projects\\council-context-control-plane\\exports\\mission-control\\policy-adoption-observation.sample.json"
    )
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function loadPolicyAdoptionObservation(
  options: LoadPolicyAdoptionOptions = {}
): PolicyAdoptionObservation | null {
  const filePath = resolvePolicyAdoptionObservationPath(options);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return policyAdoptionObservationSchema.parse(raw);
}

export function summarizePolicyAdoption(
  observation: PolicyAdoptionObservation | null
): PolicyAdoptionSummary {
  const counts = { ...EMPTY_COUNTS };
  if (!observation) {
    return {
      observedAtUtc: null,
      producer: null,
      counts,
      observations: []
    };
  }

  for (const item of observation.observations) {
    counts[item.adoptionStatus] += 1;
  }

  return {
    observedAtUtc: observation.observedAtUtc,
    producer: observation.producer ?? null,
    counts,
    observations: observation.observations
  };
}
