export type Role = 'system' | 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'complete' | 'error'

export type ProviderPreset = 'lmstudio' | 'ollama' | 'vllm' | 'custom'

export type UiDensity = 'comfortable' | 'compact'

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

export interface AppSettings {
  provider: ProviderConfig
  uiDensity: UiDensity
  schemaVersion: 1
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
}

export interface ProviderPresetDefinition {
  id: Exclude<ProviderPreset, 'custom'>
  label: string
  baseUrl: string
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
]

export const DEFAULT_SETTINGS: AppSettings = {
  provider: {
    preset: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: '',
    model: 'Qwen3.5-9B',
    temperature: 0.7,
    maxTokens: 1024,
    stream: true,
  },
  uiDensity: 'comfortable',
  schemaVersion: 1,
}
