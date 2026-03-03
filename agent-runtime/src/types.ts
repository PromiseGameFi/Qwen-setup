export type Role = 'system' | 'user' | 'assistant'

export type ModeType = 'chat' | 'agent' | 'deep_think' | 'deep_research' | 'swarm'

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ChatCompletionMessage {
  role: Role
  content: string
}

export interface ModelConfig {
  baseUrl: string
  model: string
  apiKey?: string
  temperature: number
  maxTokens: number
}

export interface RunConfig {
  maxSteps: number
  maxSources: number
  timeBudgetSec: number
  swarmMaxAgents: number
  thinkingPasses: number
}

export interface ProviderKeys {
  tavilyApiKey?: string
  braveApiKey?: string
}

export interface Citation {
  sourceId: string
  url: string
  title: string
  snippet: string
  claimRef: string
  confidence: number
}

export interface EvidenceRow {
  sourceId: string
  url: string
  title: string
  snippet: string
  score: number
}

export interface ToolTraceEntry {
  name: string
  input: string
  output: string
  durationMs: number
  ok: boolean
}

export interface AgentOutput {
  role: string
  content: string
  confidence: number
}

export interface RunArtifact {
  plan: string[]
  toolTrace: ToolTraceEntry[]
  evidenceTable: EvidenceRow[]
  agentOutputs: AgentOutput[]
  finalAnswer: string
}

export interface RunSummary {
  id: string
  threadId: string
  mode: ModeType
  prompt: string
  status: RunStatus
  createdAt: string
  updatedAt: string
  citations: Citation[]
  artifact: RunArtifact
  metrics: Record<string, number>
  error?: string
}

export interface PersistedRun extends RunSummary {
  modelConfig: ModelConfig
  runConfig: RunConfig
}

export interface RunTimelineEvent {
  id: number
  runId: string
  event: RunEventName
  payload: Record<string, unknown>
  createdAt: string
}

export type RunEventName =
  | 'run.started'
  | 'plan.step'
  | 'tool.call'
  | 'tool.result'
  | 'agent.update'
  | 'citation.added'
  | 'draft.delta'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'

export interface CreateRunRequest {
  threadId: string
  mode: ModeType
  prompt: string
  history?: ChatCompletionMessage[]
  modelConfig: ModelConfig
  runConfig?: Partial<RunConfig>
  providerKeys?: ProviderKeys
}

export interface CreateRunResponse {
  runId: string
  status: RunStatus
}

export interface HealthResponse {
  ok: boolean
  modelReachable: boolean
  providers: {
    tavilyReady: boolean
    braveReady: boolean
  }
  diagnostics: {
    modelBaseUrl: string
    endpoint: string
    message?: string
  }
}

export interface BenchmarkModeResult {
  pass: boolean
  metrics: Record<string, number>
  thresholds: Record<string, number>
}

export interface BenchmarkReport {
  id: string
  generatedAt: string
  gatePassed: boolean
  modes: {
    agent: BenchmarkModeResult
    deepThink: BenchmarkModeResult
    deepResearch: BenchmarkModeResult
    swarm: BenchmarkModeResult
  }
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxSteps: 8,
  maxSources: 6,
  timeBudgetSec: 180,
  swarmMaxAgents: 4,
  thinkingPasses: 3,
}

export function mergeRunConfig(next?: Partial<RunConfig>): RunConfig {
  return {
    ...DEFAULT_RUN_CONFIG,
    ...next,
    maxSteps: clampInt(next?.maxSteps, DEFAULT_RUN_CONFIG.maxSteps, 1, 24),
    maxSources: clampInt(next?.maxSources, DEFAULT_RUN_CONFIG.maxSources, 1, 16),
    timeBudgetSec: clampInt(next?.timeBudgetSec, DEFAULT_RUN_CONFIG.timeBudgetSec, 15, 900),
    swarmMaxAgents: clampInt(next?.swarmMaxAgents, DEFAULT_RUN_CONFIG.swarmMaxAgents, 3, 5),
    thinkingPasses: clampInt(next?.thinkingPasses, DEFAULT_RUN_CONFIG.thinkingPasses, 2, 6),
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  const next = Math.round(value as number)
  return Math.max(min, Math.min(max, next))
}
