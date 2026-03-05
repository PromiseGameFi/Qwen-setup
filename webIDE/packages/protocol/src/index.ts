import { z } from 'zod'

export const AGENT_MODES = ['plan', 'execute', 'repair'] as const
export type AgentMode = (typeof AGENT_MODES)[number]

export const AUTONOMY_LEVELS = ['patch_preview', 'full_autonomy'] as const
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number]

export const AgentRunRequestSchema = z.object({
  workspaceId: z.string().min(1),
  goal: z.string().min(1),
  mode: z.enum(AGENT_MODES),
  modelProfile: z.string().default('qwen3.5-9b-q4'),
  autonomyLevel: z.enum(AUTONOMY_LEVELS).default('full_autonomy'),
  contextRefs: z.array(z.string()).default([]),
})

export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>

export const CommandPolicyDecisionSchema = z.object({
  action: z.enum(['allow', 'confirm', 'deny']),
  reason: z.string().min(1),
  ruleId: z.string().min(1),
})

export type CommandPolicyDecision = z.infer<typeof CommandPolicyDecisionSchema>

export const ModelStatusSchema = z.object({
  installed: z.boolean(),
  modelId: z.string(),
  quant: z.string(),
  bytes: z.number().int().nonnegative(),
  checksum: z.string().optional(),
  serving: z.boolean(),
  endpoint: z.string().url(),
  progress: z.number().min(0).max(1).optional(),
  updatedAt: z.string(),
})

export type ModelStatus = z.infer<typeof ModelStatusSchema>

export const KnowledgePackStatusSchema = z.object({
  version: z.string(),
  installedAt: z.string(),
  sources: z.array(z.string()),
  embeddingVersion: z.string(),
})

export type KnowledgePackStatus = z.infer<typeof KnowledgePackStatusSchema>

export const WorkspaceCheckpointSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  createdAt: z.string(),
  gitRef: z.string().nullable(),
  summary: z.string(),
})

export type WorkspaceCheckpoint = z.infer<typeof WorkspaceCheckpointSchema>

export const AgentRunEventSchema = z.object({
  id: z.number().int().positive(),
  runId: z.string(),
  ts: z.string(),
  kind: z.enum([
    'run.started',
    'plan.step',
    'retrieval.hit',
    'policy.decision',
    'patch.preview',
    'file.write',
    'command.start',
    'command.output',
    'command.finish',
    'citation.added',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ]),
  payload: z.record(z.string(), z.unknown()),
})

export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>

export const WorkspaceOpenRequestSchema = z.object({
  rootPath: z.string().min(1),
  label: z.string().optional(),
})

export type WorkspaceOpenRequest = z.infer<typeof WorkspaceOpenRequestSchema>

export const WorkspaceOpenResponseSchema = z.object({
  id: z.string(),
  rootPath: z.string(),
  label: z.string(),
  createdAt: z.string(),
})

export type WorkspaceOpenResponse = z.infer<typeof WorkspaceOpenResponseSchema>

export const WorkspaceTreeNodeSchema: z.ZodType<WorkspaceTreeNode> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.array(z.lazy(() => WorkspaceTreeNodeSchema)).optional(),
  size: z.number().int().nonnegative().optional(),
})

export type WorkspaceTreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
  size?: number
}

export const WorkspaceCommandRequestSchema = z.object({
  workspaceId: z.string().min(1),
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(600000).default(120000),
  confirmed: z.boolean().default(false),
})

export type WorkspaceCommandRequest = z.infer<typeof WorkspaceCommandRequestSchema>

export const WorkspaceFileWriteRequestSchema = z.object({
  workspaceId: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
})

export type WorkspaceFileWriteRequest = z.infer<typeof WorkspaceFileWriteRequestSchema>

export const PairingRequestSchema = z.object({
  origin: z.string().url(),
})

export type PairingRequest = z.infer<typeof PairingRequestSchema>

export const PairingResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
})

export type PairingResponse = z.infer<typeof PairingResponseSchema>

export interface BridgePingResponse {
  ok: true
  service: 'webide-bridge'
  version: string
  time: string
  pairingRequired: boolean
}
