import type { ChatCompletionMessage, ModelConfig } from './types'

interface OpenAiMessage {
  content?: string
}

interface OpenAiChoice {
  message?: OpenAiMessage
  delta?: OpenAiMessage
}

interface OpenAiCompletionResponse {
  choices?: OpenAiChoice[]
  error?: {
    message?: string
  }
}

interface ModelRequestOptions {
  config: ModelConfig
  messages: ChatCompletionMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export async function requestModelCompletion({
  config,
  messages,
  temperature,
  maxTokens,
  signal,
}: ModelRequestOptions): Promise<string> {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`

  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

  if (config.apiKey?.trim()) {
    headers.authorization = `Bearer ${config.apiKey.trim()}`
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
        temperature: temperature ?? config.temperature,
        max_tokens: maxTokens ?? config.maxTokens,
        stream: false,
      }),
    })
  } catch (error) {
    throw formatModelError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Model request failed (${response.status})`)
  }

  let payload: OpenAiCompletionResponse
  try {
    payload = (await response.json()) as OpenAiCompletionResponse
  } catch {
    throw new Error('Model server returned non-JSON response.')
  }

  if (payload.error?.message) {
    throw new Error(payload.error.message)
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return ''
  }

  return content
}

interface StreamModelRequestOptions extends ModelRequestOptions {
  onDelta: (delta: string) => void
}

export async function streamModelCompletion({
  config,
  messages,
  temperature,
  maxTokens,
  signal,
  onDelta,
}: StreamModelRequestOptions): Promise<string> {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`
  const headers: HeadersInit = {
    'content-type': 'application/json',
  }

  if (config.apiKey?.trim()) {
    headers.authorization = `Bearer ${config.apiKey.trim()}`
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
        temperature: temperature ?? config.temperature,
        max_tokens: maxTokens ?? config.maxTokens,
        stream: true,
      }),
    })
  } catch (error) {
    throw formatModelError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Model stream failed (${response.status})`)
  }

  if (!response.body) {
    throw new Error('Streaming response body is unavailable.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let combined = ''
  let buffer = ''

  const handleLine = (line: string): boolean => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) {
      return false
    }

    const rawPayload = trimmed.slice(5).trim()
    if (!rawPayload) {
      return false
    }

    if (rawPayload === '[DONE]') {
      return true
    }

    let payload: OpenAiCompletionResponse
    try {
      payload = JSON.parse(rawPayload) as OpenAiCompletionResponse
    } catch {
      return false
    }

    if (payload.error?.message) {
      throw new Error(payload.error.message)
    }

    const delta = payload.choices?.[0]?.delta?.content
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function formatModelError(error: unknown, endpoint: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error
  }

  if (error instanceof TypeError) {
    return new Error(`Cannot reach ${endpoint}. Check model server and CORS/network settings.`)
  }

  return error instanceof Error ? error : new Error('Unknown model request failure.')
}
