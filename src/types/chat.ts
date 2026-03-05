export type Role = 'system' | 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'complete' | 'error'

export type ProviderPreset =
  | 'lmstudio'
  | 'ollama'
  | 'vllm'
  | 'hf_space'
  | 'openrouter'
  | 'custom'

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
  defaultModel: string
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

function resolveProviderPreset(value: string | undefined): ProviderPreset {
  if (
    value === 'lmstudio' ||
    value === 'ollama' ||
    value === 'vllm' ||
    value === 'hf_space' ||
    value === 'openrouter' ||
    value === 'custom'
  ) {
    return value
  }

  return 'lmstudio'
}

const DEFAULT_PROVIDER_PRESET = resolveProviderPreset(import.meta.env.VITE_PROVIDER_PRESET)
const LOCAL_MODEL_BASE_URL = envString(import.meta.env.VITE_LOCAL_MODEL_BASE_URL, 'http://127.0.0.1:1234/v1')
const LOCAL_MODEL_NAME = envString(import.meta.env.VITE_LOCAL_MODEL_NAME, 'Qwen3.5-9B')
const HF_SPACE_BASE_URL = envString(
  import.meta.env.VITE_HF_SPACE_BASE_URL,
  'https://your-space-name.hf.space/v1',
)
const HF_SPACE_MODEL_NAME = envString(
  import.meta.env.VITE_HF_SPACE_MODEL_NAME,
  'Qwen3.5-0.8B-Q4_K_M.gguf',
)
const HF_SPACE_API_KEY = envString(import.meta.env.VITE_HF_SPACE_API_KEY, '')
const OPENROUTER_BASE_URL = envString(
  import.meta.env.VITE_OPENROUTER_BASE_URL,
  'https://openrouter.ai/api/v1',
)
const OPENROUTER_MODEL_NAME = envString(import.meta.env.VITE_OPENROUTER_MODEL_NAME, 'openrouter/auto')
const OPENROUTER_API_KEY = envString(import.meta.env.VITE_OPENROUTER_API_KEY, '')

export const PROVIDER_PRESETS: ProviderPresetDefinition[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: LOCAL_MODEL_BASE_URL,
    defaultModel: LOCAL_MODEL_NAME,
  },
  {
    id: 'ollama',
    label: 'Ollama (OpenAI mode)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: LOCAL_MODEL_NAME,
  },
  {
    id: 'vllm',
    label: 'vLLM',
    baseUrl: 'http://127.0.0.1:8000/v1',
    defaultModel: LOCAL_MODEL_NAME,
  },
  {
    id: 'hf_space',
    label: 'Hugging Face Space',
    baseUrl: HF_SPACE_BASE_URL,
    defaultModel: HF_SPACE_MODEL_NAME,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (No Build)',
    baseUrl: OPENROUTER_BASE_URL,
    defaultModel: OPENROUTER_MODEL_NAME,
  },
]

export function getProviderPresetDefinition(preset: ProviderPreset): ProviderPresetDefinition | null {
  if (preset === 'custom') {
    return null
  }

  return PROVIDER_PRESETS.find((entry) => entry.id === preset) ?? null
}

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
    preset: DEFAULT_PROVIDER_PRESET,
    baseUrl: envString(
      import.meta.env.VITE_MODEL_BASE_URL,
      getProviderPresetDefinition(DEFAULT_PROVIDER_PRESET)?.baseUrl ?? LOCAL_MODEL_BASE_URL,
    ),
    apiKey: envString(
      import.meta.env.VITE_MODEL_API_KEY,
      DEFAULT_PROVIDER_PRESET === 'hf_space'
        ? HF_SPACE_API_KEY
        : DEFAULT_PROVIDER_PRESET === 'openrouter'
          ? OPENROUTER_API_KEY
          : '',
    ),
    model: envString(
      import.meta.env.VITE_MODEL_NAME,
      getProviderPresetDefinition(DEFAULT_PROVIDER_PRESET)?.defaultModel ?? LOCAL_MODEL_NAME,
    ),
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
