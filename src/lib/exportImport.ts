import type { AgentRunRecord, AppSettings, ChatMessage, ChatThread, ExportBundleV1 } from '../types/chat'

export function createExportBundle(
  threads: ChatThread[],
  messages: ChatMessage[],
  settings: AppSettings,
  runs: AgentRunRecord[] = [],
): ExportBundleV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    threads,
    messages,
    settings,
    runs,
  }
}

export function serializeExportBundle(bundle: ExportBundleV1): string {
  return JSON.stringify(bundle, null, 2)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateThread(thread: unknown): thread is ChatThread {
  if (!isRecord(thread)) {
    return false
  }

  return (
    typeof thread.id === 'string' &&
    typeof thread.title === 'string' &&
    typeof thread.createdAt === 'string' &&
    typeof thread.updatedAt === 'string' &&
    typeof thread.model === 'string'
  )
}

function validateMessage(message: unknown): message is ChatMessage {
  if (!isRecord(message)) {
    return false
  }

  return (
    typeof message.id === 'string' &&
    typeof message.threadId === 'string' &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    (message.status === 'streaming' || message.status === 'complete' || message.status === 'error')
  )
}

function validateSettings(settings: unknown): settings is AppSettings {
  if (!isRecord(settings)) {
    return false
  }

  const provider = settings.provider
  if (!isRecord(provider)) {
    return false
  }

  const runtime = settings.runtime
  const runtimeRecord = isRecord(runtime) ? runtime : null
  const runConfig = runtimeRecord?.runConfig
  const providerKeys = runtimeRecord?.providerKeys

  return (
    (settings.schemaVersion === 1 || settings.schemaVersion === 2) &&
    (settings.uiDensity === 'comfortable' || settings.uiDensity === 'compact') &&
    (provider.preset === 'lmstudio' ||
      provider.preset === 'ollama' ||
      provider.preset === 'vllm' ||
      provider.preset === 'hf_space' ||
      provider.preset === 'openrouter' ||
      provider.preset === 'custom') &&
    typeof provider.baseUrl === 'string' &&
    typeof provider.model === 'string' &&
    typeof provider.temperature === 'number' &&
    typeof provider.maxTokens === 'number' &&
    provider.stream === true &&
    (!runtimeRecord ||
      (typeof runtimeRecord.sidecarBaseUrl === 'string' &&
        (runtimeRecord.defaultMode === 'chat' ||
          runtimeRecord.defaultMode === 'agent' ||
          runtimeRecord.defaultMode === 'deep_think' ||
          runtimeRecord.defaultMode === 'deep_research' ||
          runtimeRecord.defaultMode === 'swarm') &&
        isRecord(runConfig) &&
        typeof runConfig.maxSteps === 'number' &&
        typeof runConfig.maxSources === 'number' &&
        typeof runConfig.timeBudgetSec === 'number' &&
        typeof runConfig.swarmMaxAgents === 'number' &&
        typeof runConfig.thinkingPasses === 'number' &&
        isRecord(providerKeys)))
  )
}

function validateRun(run: unknown): run is AgentRunRecord {
  if (!isRecord(run)) {
    return false
  }

  return (
    typeof run.id === 'string' &&
    typeof run.threadId === 'string' &&
    typeof run.prompt === 'string' &&
    typeof run.createdAt === 'string' &&
    typeof run.updatedAt === 'string' &&
    Array.isArray(run.citations) &&
    isRecord(run.artifact) &&
    isRecord(run.metrics) &&
    Array.isArray(run.timeline)
  )
}

export function parseExportBundle(raw: string): ExportBundleV1 {
  const parsed: unknown = JSON.parse(raw)

  assert(isRecord(parsed), 'Import file is not a JSON object.')
  assert(parsed.version === 1, 'Unsupported export version. Expected version 1.')
  assert(Array.isArray(parsed.threads), 'Export is missing "threads" array.')
  assert(Array.isArray(parsed.messages), 'Export is missing "messages" array.')
  assert(validateSettings(parsed.settings), 'Export "settings" payload is invalid.')

  assert(parsed.threads.every(validateThread), 'One or more threads are invalid.')
  assert(parsed.messages.every(validateMessage), 'One or more messages are invalid.')

  const runs = Array.isArray(parsed.runs) ? parsed.runs : []
  assert(runs.every(validateRun), 'One or more runs are invalid.')

  return {
    version: 1,
    exportedAt:
      typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    threads: parsed.threads,
    messages: parsed.messages,
    settings: parsed.settings,
    runs,
  }
}
