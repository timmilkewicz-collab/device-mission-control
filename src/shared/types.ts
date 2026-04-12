import { z } from "zod";

export const platformSchema = z.enum(["windows", "linux"]);
export type Platform = z.infer<typeof platformSchema>;

export const capabilitySchema = z.enum([
  "activeWindow",
  "workspace",
  "screenshot",
  "services",
  "processes",
  "containers",
  "tasks",
  "logs"
]);
export type Capability = z.infer<typeof capabilitySchema>;

export const taskExecutionModeSchema = z.enum(["disabled", "approval", "trusted"]);
export type TaskExecutionMode = z.infer<typeof taskExecutionModeSchema>;

export const permissionsSchema = z.object({
  observe: z.boolean().default(true),
  suggest: z.boolean().default(true),
  taskExecution: taskExecutionModeSchema.default("approval"),
  shell: z.boolean().default(false),
  desktopControl: z.boolean().default(false)
});
export type Permissions = z.infer<typeof permissionsSchema>;

export const taskDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  requiresApproval: z.boolean().default(true),
  platforms: z.array(platformSchema).min(1)
});
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;

export const serviceSchema = z.object({
  name: z.string().min(1),
  status: z.string().min(1),
  detail: z.string().optional()
});
export type ServiceSnapshot = z.infer<typeof serviceSchema>;

export const processSchema = z.object({
  name: z.string().min(1),
  cpu: z.number().optional(),
  memoryMb: z.number().optional(),
  detail: z.string().optional()
});
export type ProcessSnapshot = z.infer<typeof processSchema>;

export const screenshotSchema = z.object({
  path: z.string().min(1),
  capturedAt: z.string().min(1),
  error: z.string().optional()
});
export type ScreenshotSnapshot = z.infer<typeof screenshotSchema>;

export const observationSchema = z.object({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  capturedAt: z.string().min(1),
  summary: z.string().min(1),
  activeWindow: z.string().optional(),
  workspace: z.string().optional(),
  screenshots: z.array(screenshotSchema).default([]),
  services: z.array(serviceSchema).default([]),
  processes: z.array(processSchema).default([]),
  containers: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  taskCatalog: z.array(taskDefinitionSchema).default([])
});
export type Observation = z.infer<typeof observationSchema>;

export const deviceRegistrationSchema = z.object({
  deviceId: z.string().min(1),
  displayName: z.string().min(1),
  hostName: z.string().min(1),
  platform: platformSchema,
  tags: z.array(z.string()).default([]),
  capabilities: z.array(capabilitySchema).default([]),
  permissions: permissionsSchema.default({
    observe: true,
    suggest: true,
    taskExecution: "approval",
    shell: false,
    desktopControl: false
  }),
  taskCatalog: z.array(taskDefinitionSchema).default([])
});
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;

export const deviceRecordSchema = deviceRegistrationSchema.extend({
  registeredAt: z.string().min(1),
  lastSeenAt: z.string().min(1)
});
export type DeviceRecord = z.infer<typeof deviceRecordSchema>;

export const taskRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed"
]);
export type TaskRequestStatus = z.infer<typeof taskRequestStatusSchema>;

export const taskRequestSchema = z.object({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  taskId: z.string().min(1),
  arguments: z.record(z.string(), z.string()).default({}),
  requestedBy: z.string().min(1),
  requestedAt: z.string().min(1),
  status: taskRequestStatusSchema,
  approvalRequired: z.boolean(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedReason: z.string().optional(),
  resultSummary: z.string().optional(),
  resultDetail: z.string().optional(),
  updatedAt: z.string().min(1)
});
export type TaskRequest = z.infer<typeof taskRequestSchema>;

export const planSnapshotSchema = z.object({
  createdAt: z.string().min(1),
  deviceSummaries: z.array(z.string()).default([]),
  attention: z.array(z.string()).default([]),
  suggestedActions: z.array(z.string()).default([]),
  silentLoop: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([])
});
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;

export const desktopControlEvaluationSchema = z.object({
  recommendation: z.enum(["not_ready", "pilot_ready"]),
  reasons: z.array(z.string()).default([]),
  checkedAt: z.string().min(1)
});
export type DesktopControlEvaluation = z.infer<typeof desktopControlEvaluationSchema>;

export const nodeKindSchema = z.enum(["machine", "mobile", "wearable", "server", "agent", "app"]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

export const integrationStatusSchema = z.enum(["discovered", "reachable", "partial", "active", "offline"]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const reachabilitySchema = z.object({
  tailscale: z.boolean().default(false),
  ssh: z.boolean().default(false),
  localAgent: z.boolean().default(false),
  companion: z.boolean().default(false),
  notes: z.array(z.string()).default([])
});
export type Reachability = z.infer<typeof reachabilitySchema>;

export const nodeRecordSchema = z.object({
  nodeId: z.string().min(1),
  label: z.string().min(1),
  kind: nodeKindSchema,
  platform: z.string().min(1),
  status: integrationStatusSchema,
  linkedDeviceId: z.string().optional(),
  linkedNodeIds: z.array(z.string()).default([]),
  agentSurfaces: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  reachability: reachabilitySchema.default({
    tailscale: false,
    ssh: false,
    localAgent: false,
    companion: false,
    notes: []
  }),
  tags: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  lastSeenAt: z.string().optional(),
  registeredAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type NodeRecord = z.infer<typeof nodeRecordSchema>;

export const taskRequestInputSchema = z.object({
  deviceId: z.string().min(1),
  taskId: z.string().min(1),
  arguments: z.record(z.string(), z.string()).default({}),
  requestedBy: z.string().min(1).default("user")
});
export type TaskRequestInput = z.infer<typeof taskRequestInputSchema>;

export const taskDecisionSchema = z.object({
  approved: z.boolean(),
  actor: z.string().min(1),
  reason: z.string().optional()
});
export type TaskDecisionInput = z.infer<typeof taskDecisionSchema>;

export const councilSessionInputSchema = z.object({
  topic: z.string().min(1),
  prompt: z.string().min(1),
  requestedBy: z.string().min(1).default("operator"),
  targetMemberIds: z.array(z.string()).default([])
});
export type CouncilSessionInput = z.infer<typeof councilSessionInputSchema>;

export const councilResponseInputSchema = z.object({
  memberId: z.string().min(1),
  memberLabel: z.string().min(1),
  stance: z.enum(["support", "concern", "block", "inform"]),
  summary: z.string().min(1),
  detail: z.string().optional()
});
export type CouncilResponseInput = z.infer<typeof councilResponseInputSchema>;

export const taskResultInputSchema = z.object({
  status: z.enum(["executing", "completed", "failed"]),
  resultSummary: z.string().optional(),
  resultDetail: z.string().optional()
});
export type TaskResultInput = z.infer<typeof taskResultInputSchema>;

export const councilSessionStatusSchema = z.enum(["open", "closed"]);
export type CouncilSessionStatus = z.infer<typeof councilSessionStatusSchema>;

export const councilResponseSchema = z.object({
  id: z.string().min(1),
  memberId: z.string().min(1),
  memberLabel: z.string().min(1),
  stance: z.enum(["support", "concern", "block", "inform"]),
  summary: z.string().min(1),
  detail: z.string().optional(),
  submittedAt: z.string().min(1)
});
export type CouncilResponse = z.infer<typeof councilResponseSchema>;

export const councilSessionSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  prompt: z.string().min(1),
  requestedBy: z.string().min(1),
  targetMemberIds: z.array(z.string()).default([]),
  status: councilSessionStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  closedAt: z.string().optional(),
  responses: z.array(councilResponseSchema).default([])
});
export type CouncilSession = z.infer<typeof councilSessionSchema>;

export const hubStateSchema = z.object({
  nodes: z.record(z.string(), nodeRecordSchema).default({}),
  devices: z.record(z.string(), deviceRecordSchema).default({}),
  observations: z.array(observationSchema).default([]),
  taskRequests: z.array(taskRequestSchema).default([]),
  councilSessions: z.array(councilSessionSchema).default([]),
  planSnapshots: z.array(planSnapshotSchema).default([]),
  desktopControlEvaluation: desktopControlEvaluationSchema.optional()
});
export type HubState = z.infer<typeof hubStateSchema>;

export const nodeUpsertSchema = z.object({
  nodeId: z.string().min(1),
  label: z.string().min(1),
  kind: nodeKindSchema,
  platform: z.string().min(1),
  status: integrationStatusSchema.default("discovered"),
  linkedDeviceId: z.string().optional(),
  linkedNodeIds: z.array(z.string()).default([]),
  agentSurfaces: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  reachability: reachabilitySchema.default({
    tailscale: false,
    ssh: false,
    localAgent: false,
    companion: false,
    notes: []
  }),
  tags: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  lastSeenAt: z.string().optional()
});
export type NodeUpsertInput = z.infer<typeof nodeUpsertSchema>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
