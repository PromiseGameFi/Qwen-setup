import type { ProviderConfig, Role } from '../../types/chat'

export interface ChatCompletionMessage {
  role: Role
  content: string
}

interface OpenAiDelta {
  content?: string
}

interface OpenAiChoice {
  delta?: OpenAiDelta
}

interface OpenAiStreamChunk {
  choices?: OpenAiChoice[]
  error?: {
    message?: string
  }
}

export type ParsedDataLine = OpenAiStreamChunk | 'DONE' | null

export function parseSseDataLine(rawLine: string): ParsedDataLine {
  const line = rawLine.trim()
  if (!line || line.startsWith(':')) {
    return null
  }

  if (!line.startsWith('data:')) {
    return null
  }

  const payload = line.slice(5).trim()
  if (!payload) {
    return null
  }

  if (payload === '[DONE]') {
    return 'DONE'
  }

  try {
    return JSON.parse(payload) as OpenAiStreamChunk
  } catch {
    return null
  }
}

function getBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function formatNetworkError(error: unknown, endpoint: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error
  }

  if (error instanceof TypeError) {
    return new Error(
      [
        `Cannot reach ${endpoint}.`,
        'Start an OpenAI-compatible server and verify CORS is enabled for browser requests.',
      ].join(' '),
    )
  }

  if (error instanceof Error) {
    return error
  }

  return new Error('Unknown network error while contacting model server.')
}

export interface StreamChatCompletionOptions {
  config: ProviderConfig
  messages: ChatCompletionMessage[]
  signal?: AbortSignal
  onDelta: (delta: string) => void
}

export async function streamChatCompletion({
  config,
  messages,
  signal,
  onDelta,
}: StreamChatCompletionOptions): Promise<string> {
  const endpoint = `${getBaseUrl(config.baseUrl)}/chat/completions`
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
    })
  } catch (error) {
    throw formatNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Request failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is missing.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let combined = ''

  const handleLine = (line: string): boolean => {
    const parsed = parseSseDataLine(line)

    if (parsed === 'DONE') {
      return true
    }

    if (!parsed) {
      return false
    }

    if (parsed.error?.message) {
      throw new Error(parsed.error.message)
    }

    const delta = parsed.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) {
      combined += delta
      onDelta(delta)
    }

    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (handleLine(line)) {
        return combined
      }
    }
  }

  if (buffer.trim()) {
    handleLine(buffer)
  }

  return combined
}
