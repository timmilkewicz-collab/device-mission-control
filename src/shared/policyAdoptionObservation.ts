import { z } from "zod";

/** Read-only adoption status from Council Context Pack Federation. */
export const policyAdoptionStatusSchema = z.enum([
  "current",
  "outdated",
  "pending-review",
  "drifted"
]);
export type PolicyAdoptionStatus = z.infer<typeof policyAdoptionStatusSchema>;

export const policyAdoptionObservationItemSchema = z.object({
  contextId: z.string().min(1),
  packId: z.string().min(1),
  packVersion: z.string().min(1),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  adoptionStatus: policyAdoptionStatusSchema,
  distributionReceiptId: z.string().optional(),
  targetRepository: z.string().optional(),
  lastDistributedAtUtc: z.string().optional(),
  notes: z.string().optional()
});
export type PolicyAdoptionObservationItem = z.infer<typeof policyAdoptionObservationItemSchema>;

/**
 * mission-control.policy-adoption-observation.v1
 * Mission Control consumes this contract read-only. No pack write/merge authority.
 */
export const policyAdoptionObservationSchema = z.object({
  schema: z.literal("mission-control.policy-adoption-observation.v1"),
  observedAtUtc: z.string().min(1),
  producer: z.string().optional(),
  observations: z.array(policyAdoptionObservationItemSchema).default([])
});
export type PolicyAdoptionObservation = z.infer<typeof policyAdoptionObservationSchema>;

export type PolicyAdoptionSummary = {
  observedAtUtc: string | null;
  producer: string | null;
  counts: Record<PolicyAdoptionStatus, number>;
  observations: PolicyAdoptionObservationItem[];
};
