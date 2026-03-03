import type { AppSettings, ChatMessage, ChatThread, ExportBundleV1 } from '../types/chat'

export function createExportBundle(
  threads: ChatThread[],
  messages: ChatMessage[],
  settings: AppSettings,
): ExportBundleV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    threads,
    messages,
    settings,
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

  return (
    settings.schemaVersion === 1 &&
    (settings.uiDensity === 'comfortable' || settings.uiDensity === 'compact') &&
    (provider.preset === 'lmstudio' ||
      provider.preset === 'ollama' ||
      provider.preset === 'vllm' ||
      provider.preset === 'custom') &&
    typeof provider.baseUrl === 'string' &&
    typeof provider.model === 'string' &&
    typeof provider.temperature === 'number' &&
    typeof provider.maxTokens === 'number' &&
    provider.stream === true
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

  return {
    version: 1,
    exportedAt:
      typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    threads: parsed.threads,
    messages: parsed.messages,
    settings: parsed.settings,
  }
}
