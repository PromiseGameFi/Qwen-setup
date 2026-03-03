import type {
  AgentRunRecord,
  BenchmarkReport,
  ChatMessage,
  ModeType,
  ProviderConfig,
  RunConfig,
  RunEventName,
  RunTimelineEvent,
} from '../../types/chat'

export interface AgentRuntimeRunRequest {
  threadId: string
  mode: ModeType
  prompt: string
  history: ChatMessage[]
  provider: ProviderConfig
  runConfig: RunConfig
  sidecarBaseUrl: string
  providerKeys?: {
    tavilyApiKey?: string
    braveApiKey?: string
  }
}

interface CreateRunResponse {
  runId: string
  status: string
}

interface RuntimeHealthResponse {
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

export interface RuntimeHealthResult {
  status: 'online' | 'degraded' | 'offline'
  payload: RuntimeHealthResponse | null
  message?: string
}

export type RuntimeTransportErrorCode =
  | 'network_unreachable'
  | 'stream_interrupted'
  | 'server_error'

export class RuntimeTransportError extends Error {
  public readonly code: RuntimeTransportErrorCode

  public readonly endpoint: string

  public readonly status?: number

  public constructor(
    code: RuntimeTransportErrorCode,
    endpoint: string,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'RuntimeTransportError'
    this.code = code
    this.endpoint = endpoint
    this.status = status
  }
}

export async function createRun(request: AgentRuntimeRunRequest): Promise<CreateRunResponse> {
  const endpoint = `${normalizeBaseUrl(request.sidecarBaseUrl)}/api/runs`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: request.threadId,
        mode: request.mode,
        prompt: request.prompt,
        history: request.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        modelConfig: {
          baseUrl: request.provider.baseUrl,
          apiKey: request.provider.apiKey,
          model: request.provider.model,
          temperature: request.provider.temperature,
          maxTokens: request.provider.maxTokens,
        },
        runConfig: request.runConfig,
        providerKeys: request.providerKeys,
      }),
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to create run (${response.status})`,
      response.status,
    )
  }

  return (await response.json()) as CreateRunResponse
}

export interface StreamRunOptions {
  runId: string
  sidecarBaseUrl: string
  signal?: AbortSignal
  afterId?: number
  maxReconnects?: number
  onEvent: (event: RunTimelineEvent) => void
}

export interface StreamRunResult {
  lastEventId: number
  reconnectCount: number
  terminalEvent: RunEventName | null
}

interface StreamPassResult {
  lastEventId: number
  terminalEvent: RunEventName | null
  endedUnexpectedly: boolean
}

const TERMINAL_EVENTS = new Set<RunEventName>(['run.completed', 'run.failed', 'run.cancelled'])

export async function streamRun({
  runId,
  sidecarBaseUrl,
  signal,
  afterId = 0,
  maxReconnects = 4,
  onEvent,
}: StreamRunOptions): Promise<StreamRunResult> {
  let lastEventId = Math.max(0, Math.round(afterId))
  let reconnectCount = 0
  let terminalEvent: RunEventName | null = null

  while (true) {
    if (signal?.aborted) {
      return {
        lastEventId,
        reconnectCount,
        terminalEvent,
      }
    }

    try {
      const pass = await streamOnce({
        runId,
        sidecarBaseUrl,
        signal,
        afterId: lastEventId,
        onEvent,
      })

      lastEventId = Math.max(lastEventId, pass.lastEventId)
      terminalEvent = pass.terminalEvent

      if (terminalEvent || !pass.endedUnexpectedly) {
        return {
          lastEventId,
          reconnectCount,
          terminalEvent,
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          lastEventId,
          reconnectCount,
          terminalEvent,
        }
      }

      const transportError = asTransportError(error, sidecarBaseUrl, runId)

      if (reconnectCount >= maxReconnects) {
        throw transportError
      }

      reconnectCount += 1
      await waitWithBackoff(reconnectCount)
      continue
    }

    if (reconnectCount >= maxReconnects) {
      throw new RuntimeTransportError(
        'stream_interrupted',
        `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/stream`,
        'Run stream interrupted before completion.',
      )
    }

    reconnectCount += 1
    await waitWithBackoff(reconnectCount)
  }
}

async function streamOnce({
  runId,
  sidecarBaseUrl,
  signal,
  afterId,
  onEvent,
}: {
  runId: string
  sidecarBaseUrl: string
  signal?: AbortSignal
  afterId: number
  onEvent: (event: RunTimelineEvent) => void
}): Promise<StreamPassResult> {
  const endpointBase = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/stream`
  const endpoint = afterId > 0 ? `${endpointBase}?afterId=${afterId}` : endpointBase

  const headers: HeadersInit = {
    Accept: 'text/event-stream',
  }

  if (afterId > 0) {
    headers['Last-Event-ID'] = String(afterId)
  }

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok || !response.body) {
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      `Run stream unavailable (${response.status})`,
      response.status,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let pendingId = afterId
  let pendingEvent: RunEventName = 'agent.update'
  let pendingData = ''

  let lastEventId = afterId
  let terminalEvent: RunEventName | null = null

  const flushEvent = (): void => {
    if (!pendingData.trim()) {
      pendingData = ''
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(pendingData) as Record<string, unknown>
    } catch {
      payload = { raw: pendingData }
    }

    const event: RunTimelineEvent = {
      id: pendingId,
      runId,
      event: pendingEvent,
      payload,
      createdAt: new Date().toISOString(),
    }

    onEvent(event)
    lastEventId = Math.max(lastEventId, event.id)

    if (TERMINAL_EVENTS.has(event.event)) {
      terminalEvent = event.event
    }

    pendingData = ''
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      flushEvent()
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) {
        flushEvent()
        continue
      }

      if (line.startsWith(':')) {
        continue
      }

      if (line.startsWith('id:')) {
        const idValue = Number.parseInt(line.slice(3).trim(), 10)
        pendingId = Number.isNaN(idValue) ? pendingId + 1 : idValue
        continue
      }

      if (line.startsWith('event:')) {
        const eventName = line.slice(6).trim()
        if (isRunEventName(eventName)) {
          pendingEvent = eventName
        }
        continue
      }

      if (line.startsWith('data:')) {
        const chunk = line.slice(5).trim()
        pendingData = pendingData ? `${pendingData}\n${chunk}` : chunk
      }
    }
  }

  return {
    lastEventId,
    terminalEvent,
    endedUnexpectedly: terminalEvent === null,
  }
}

export async function getRunEventsSince(
  sidecarBaseUrl: string,
  runId: string,
  afterId: number,
): Promise<RunTimelineEvent[]> {
  const normalizedAfterId = Math.max(0, Math.round(afterId))
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/events?afterId=${normalizedAfterId}`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to fetch run events (${response.status})`,
      response.status,
    )
  }

  const payload = (await response.json()) as { events?: RunTimelineEvent[] }
  return Array.isArray(payload.events) ? payload.events : []
}

export async function cancelRun(sidecarBaseUrl: string, runId: string): Promise<void> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/cancel`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to cancel run (${response.status})`,
      response.status,
    )
  }
}

export async function getRun(
  sidecarBaseUrl: string,
  runId: string,
): Promise<{ run: AgentRunRecord; events: RunTimelineEvent[] }> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to fetch run (${response.status})`,
      response.status,
    )
  }

  const payload = (await response.json()) as AgentRunRecord & {
    events: RunTimelineEvent[]
  }

  const { events, ...run } = payload
  return { run, events }
}

export async function runBenchmark(sidecarBaseUrl: string): Promise<BenchmarkReport> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/bench/run`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to run benchmark (${response.status})`,
      response.status,
    )
  }

  return (await response.json()) as BenchmarkReport
}

export async function getLatestBenchmark(sidecarBaseUrl: string): Promise<BenchmarkReport | null> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/bench/latest`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to fetch latest benchmark (${response.status})`,
      response.status,
    )
  }

  return (await response.json()) as BenchmarkReport
}

export async function saveProviderKeys(
  sidecarBaseUrl: string,
  keys: {
    tavilyApiKey?: string
    braveApiKey?: string
  },
): Promise<void> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/provider-keys`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(keys),
    })
  } catch (error) {
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new RuntimeTransportError(
      'server_error',
      endpoint,
      body || `Failed to save provider keys (${response.status})`,
      response.status,
    )
  }
}

export async function getRuntimeHealth(sidecarBaseUrl: string): Promise<RuntimeHealthResult> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/health`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
    })
  } catch (error) {
    if (error instanceof TypeError) {
      return {
        status: 'offline',
        payload: null,
        message: `Cannot reach agent runtime at ${endpoint}. Start the sidecar with \`npm run dev:all\` or \`npm run dev:sidecar\`.`,
      }
    }

    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok) {
    return {
      status: 'offline',
      payload: null,
      message: `Agent runtime health check failed (${response.status}).`,
    }
  }

  const payload = (await response.json()) as RuntimeHealthResponse
  if (payload.ok && payload.modelReachable) {
    return {
      status: 'online',
      payload,
    }
  }

  return {
    status: 'degraded',
    payload,
    message:
      payload.diagnostics.message ??
      'Agent runtime is reachable but model endpoint is not healthy.',
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function isRunEventName(value: string): value is RunEventName {
  return (
    value === 'run.started' ||
    value === 'plan.step' ||
    value === 'tool.call' ||
    value === 'tool.result' ||
    value === 'agent.update' ||
    value === 'citation.added' ||
    value === 'draft.delta' ||
    value === 'run.completed' ||
    value === 'run.failed' ||
    value === 'run.cancelled'
  )
}

function asTransportError(error: unknown, sidecarBaseUrl: string, runId: string): RuntimeTransportError {
  if (error instanceof RuntimeTransportError) {
    return error
  }

  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/stream`

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RuntimeTransportError('stream_interrupted', endpoint, 'Run stream was aborted.')
  }

  if (error instanceof Error) {
    return new RuntimeTransportError('stream_interrupted', endpoint, error.message)
  }

  return new RuntimeTransportError('stream_interrupted', endpoint, 'Run stream interrupted.')
}

function formatRuntimeNetworkError(error: unknown, endpoint: string): RuntimeTransportError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RuntimeTransportError('stream_interrupted', endpoint, error.message)
  }

  if (error instanceof TypeError) {
    return new RuntimeTransportError(
      'network_unreachable',
      endpoint,
      [
        `Cannot reach agent runtime at ${endpoint}.`,
        'Start the stack with `npm run dev:all` (or sidecar only with `npm run dev:sidecar`), then retry.',
      ].join(' '),
    )
  }

  if (error instanceof RuntimeTransportError) {
    return error
  }

  if (error instanceof Error) {
    return new RuntimeTransportError('server_error', endpoint, error.message)
  }

  return new RuntimeTransportError(
    'server_error',
    endpoint,
    'Unknown network error while contacting agent runtime.',
  )
}

async function waitWithBackoff(attempt: number): Promise<void> {
  const base = Math.min(8000, attempt === 1 ? 1000 : attempt === 2 ? 2000 : 5000)
  const jitter = Math.floor(Math.random() * 350)
  await new Promise((resolve) => {
    window.setTimeout(resolve, base + jitter)
  })
}
