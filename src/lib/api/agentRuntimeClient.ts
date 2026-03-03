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
    throw new Error(body || `Failed to create run (${response.status})`)
  }

  return (await response.json()) as CreateRunResponse
}

export interface StreamRunOptions {
  runId: string
  sidecarBaseUrl: string
  signal?: AbortSignal
  onEvent: (event: RunTimelineEvent) => void
}

export async function streamRun({ runId, sidecarBaseUrl, signal, onEvent }: StreamRunOptions): Promise<void> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/stream`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
      },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    throw formatRuntimeNetworkError(error, endpoint)
  }

  if (!response.ok || !response.body) {
    throw new Error(`Run stream unavailable (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let pendingId = 0
  let pendingEvent: RunEventName = 'agent.update'
  let pendingData = ''

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

    onEvent({
      id: pendingId,
      runId,
      event: pendingEvent,
      payload,
      createdAt: new Date().toISOString(),
    })

    pendingData = ''
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      flushEvent()
      return
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) {
        flushEvent()
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
}

export async function cancelRun(sidecarBaseUrl: string, runId: string): Promise<void> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}/cancel`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  })

  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to cancel run (${response.status})`)
  }
}

export async function getRun(
  sidecarBaseUrl: string,
  runId: string,
): Promise<{ run: AgentRunRecord; events: RunTimelineEvent[] }> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/runs/${runId}`
  const response = await fetch(endpoint)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to fetch run (${response.status})`)
  }

  const payload = (await response.json()) as AgentRunRecord & {
    events: RunTimelineEvent[]
  }

  const { events, ...run } = payload
  return { run, events }
}

export async function runBenchmark(sidecarBaseUrl: string): Promise<BenchmarkReport> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/bench/run`
  const response = await fetch(endpoint, {
    method: 'POST',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to run benchmark (${response.status})`)
  }

  return (await response.json()) as BenchmarkReport
}

export async function getLatestBenchmark(sidecarBaseUrl: string): Promise<BenchmarkReport | null> {
  const endpoint = `${normalizeBaseUrl(sidecarBaseUrl)}/api/bench/latest`
  const response = await fetch(endpoint)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to fetch latest benchmark (${response.status})`)
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
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(keys),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Failed to save provider keys (${response.status})`)
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

function formatRuntimeNetworkError(error: unknown, endpoint: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return error
  }

  if (error instanceof TypeError) {
    return new Error(
      [
        `Cannot reach agent runtime at ${endpoint}.`,
        'Start the sidecar with `npm run dev:sidecar`, then retry.',
      ].join(' '),
    )
  }

  if (error instanceof Error) {
    return error
  }

  return new Error('Unknown network error while contacting agent runtime.')
}
