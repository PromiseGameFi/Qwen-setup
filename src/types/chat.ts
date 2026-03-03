export type Role = 'system' | 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'complete' | 'error'

export type ProviderPreset = 'lmstudio' | 'ollama' | 'vllm' | 'hf_space' | 'custom'

export type UiDensity = 'comfortable' | 'compact'

export type ModeType = 'chat' | 'agent' | 'deep_think' | 'deep_research' | 'swarm'

export type RuntimeHealthStatus = 'online' | 'degraded' | 'offline'

function envString(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed || fallback
}

function envNumber(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function envInteger(value: string | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface RunConfig {
  maxSteps: number
  maxSources: number
  timeBudgetSec: number
  swarmMaxAgents: number
  thinkingPasses: number
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

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

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

export interface RunTimelineEvent {
  id: number
  runId: string
  event: RunEventName
  payload: Record<string, unknown>
  createdAt: string
}

export interface AgentRunRecord {
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
  timeline: RunTimelineEvent[]
}

export interface ChatThread {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  model: string
}

export interface ChatMessage {
  id: string
  threadId: string
  role: Role
  content: string
  createdAt: string
  status: MessageStatus
  error?: string
}

export interface ProviderConfig {
  preset: ProviderPreset
  baseUrl: string
  apiKey?: string
  model: string
  temperature: number
  maxTokens: number
  stream: true
}

export interface RuntimeConfig {
  sidecarBaseUrl: string
  defaultMode: ModeType
  runConfig: RunConfig
  providerKeys: {
    tavilyApiKey?: string
    braveApiKey?: string
  }
}

export interface AppSettings {
  provider: ProviderConfig
  runtime: RuntimeConfig
  uiDensity: UiDensity
  schemaVersion: 2
}

export interface AppSettingRecord {
  key: 'app'
  value: AppSettings
}

export interface ExportBundleV1 {
  version: 1
  exportedAt: string
  threads: ChatThread[]
  messages: ChatMessage[]
  settings: AppSettings
  runs?: AgentRunRecord[]
}

export interface ProviderPresetDefinition {
  id: Exclude<ProviderPreset, 'custom'>
  label: string
  baseUrl: string
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

export const PROVIDER_PRESETS: ProviderPresetDefinition[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
  },
  {
    id: 'ollama',
    label: 'Ollama (OpenAI mode)',
    baseUrl: 'http://127.0.0.1:11434/v1',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    baseUrl: 'http://127.0.0.1:8000/v1',
  },
  {
    id: 'hf_space',
    label: 'Hugging Face Space',
    baseUrl: 'https://your-space-name.hf.space/v1',
  },
]

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxSteps: 8,
  maxSources: 6,
  timeBudgetSec: 180,
  swarmMaxAgents: 4,
  thinkingPasses: 3,
}

export const MODE_LABELS: Record<ModeType, string> = {
  chat: 'Chat',
  agent: 'Agent',
  deep_think: 'Deep Think',
  deep_research: 'Deep Research',
  swarm: 'Swarm',
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: {
    preset:
      import.meta.env.VITE_PROVIDER_PRESET === 'lmstudio' ||
      import.meta.env.VITE_PROVIDER_PRESET === 'ollama' ||
      import.meta.env.VITE_PROVIDER_PRESET === 'vllm' ||
      import.meta.env.VITE_PROVIDER_PRESET === 'hf_space' ||
      import.meta.env.VITE_PROVIDER_PRESET === 'custom'
        ? import.meta.env.VITE_PROVIDER_PRESET
        : 'lmstudio',
    baseUrl: envString(import.meta.env.VITE_MODEL_BASE_URL, 'http://127.0.0.1:1234/v1'),
    apiKey: envString(import.meta.env.VITE_MODEL_API_KEY, ''),
    model: envString(import.meta.env.VITE_MODEL_NAME, 'Qwen3.5-9B'),
    temperature: envNumber(import.meta.env.VITE_MODEL_TEMPERATURE, 0.7),
    maxTokens: envInteger(import.meta.env.VITE_MODEL_MAX_TOKENS, 1024),
    stream: true,
  },
  runtime: {
    sidecarBaseUrl: envString(import.meta.env.VITE_SIDECAR_BASE_URL, 'http://127.0.0.1:8787'),
    defaultMode: 'chat',
    runConfig: DEFAULT_RUN_CONFIG,
    providerKeys: {
      tavilyApiKey: envString(import.meta.env.VITE_TAVILY_API_KEY, ''),
      braveApiKey: envString(import.meta.env.VITE_BRAVE_API_KEY, ''),
    },
  },
  uiDensity: 'comfortable',
  schemaVersion: 2,
}
