import type {
  AgentRunEvent,
  AgentRunRequest,
  ModelStatus,
  PairingResponse,
  WorkspaceTreeNode,
} from '@webide/protocol'

const BRIDGE_URL = 'http://127.0.0.1:4317'
const TOKEN_KEY = 'webide.bridge.token'

let bridgeToken: string | null = null

function getToken(): string | null {
  if (bridgeToken) {
    return bridgeToken
  }

  bridgeToken = window.localStorage.getItem(TOKEN_KEY)
  return bridgeToken
}

function setToken(token: string): void {
  bridgeToken = token
  window.localStorage.setItem(TOKEN_KEY, token)
}

function headers(json = false): HeadersInit {
  const base: HeadersInit = {}
  if (json) {
    base['content-type'] = 'application/json'
  }

  const token = getToken()
  if (token) {
    base['x-webide-token'] = token
  }

  return base
}

export async function pingBridge(): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/v1/ping`, { method: 'GET' })
    return response.ok
  } catch {
    return false
  }
}

export async function pairBridge(): Promise<void> {
  const response = await fetch(`${BRIDGE_URL}/v1/pairing/request`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ origin: window.location.origin }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Pairing failed (${response.status})`)
  }

  const payload = (await response.json()) as PairingResponse
  setToken(payload.token)
}

export async function getSystemStatus(): Promise<Record<string, unknown>> {
  return await getJson('/v1/system/status')
}

export async function getModelStatus(): Promise<ModelStatus> {
  return await getJson('/v1/model/status')
}

export async function ensureModel(): Promise<ModelStatus> {
  return await postJson('/v1/model/ensure', {})
}

export async function startModel(): Promise<ModelStatus> {
  return await postJson('/v1/model/start', {})
}

export async function stopModel(): Promise<ModelStatus> {
  return await postJson('/v1/model/stop', {})
}

export async function openWorkspace(rootPath: string, label?: string): Promise<{
  id: string
  rootPath: string
  label: string
  createdAt: string
}> {
  return await postJson('/v1/workspaces/open', {
    rootPath,
    label,
  })
}

export async function listWorkspaces(): Promise<Array<{ id: string; rootPath: string; label: string }>> {
  const payload = (await getJson('/v1/workspaces')) as {
    items?: Array<{ id: string; rootPath: string; label: string }>
  }
  return payload.items ?? []
}

export async function getWorkspaceTree(workspaceId: string): Promise<{
  workspace: { id: string; rootPath: string; label: string }
  tree: WorkspaceTreeNode
}> {
  return await getJson(`/v1/workspaces/${workspaceId}/tree`)
}

export async function readFile(workspaceId: string, filePath: string): Promise<string> {
  const encoded = encodeURIComponent(filePath)
  const payload = (await getJson(`/v1/workspaces/${workspaceId}/file?path=${encoded}`)) as {
    content: string
  }
  return payload.content
}

export async function writeFile(workspaceId: string, filePath: string, content: string): Promise<void> {
  await fetch(`${BRIDGE_URL}/v1/workspaces/${workspaceId}/file`, {
    method: 'PUT',
    headers: headers(true),
    body: JSON.stringify({
      workspaceId,
      path: filePath,
      content,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error((await response.text().catch(() => '')) || `Write failed (${response.status})`)
    }
  })
}

export async function runCommand(workspaceId: string, command: string, confirmed = false): Promise<{
  status: number
  payload: Record<string, unknown>
}> {
  const response = await fetch(`${BRIDGE_URL}/v1/workspaces/${workspaceId}/commands`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      workspaceId,
      command,
      confirmed,
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return {
    status: response.status,
    payload,
  }
}

export async function startAgentRun(request: AgentRunRequest): Promise<{ runId: string }> {
  return await postJson('/v1/agent/runs', request)
}

export function streamAgentRun(
  runId: string,
  onEvent: (event: AgentRunEvent) => void,
  onError: (message: string) => void,
): () => void {
  const url = new URL(`${BRIDGE_URL}/v1/agent/runs/${runId}/stream`)

  const eventSource = new EventSource(url)

  const kinds: AgentRunEvent['kind'][] = [
    'run.started',
    'plan.step',
    'retrieval.hit',
    'policy.decision',
    'patch.preview',
    'file.write',
    'command.start',
    'command.output',
    'command.finish',
    'citation.added',
    'run.completed',
    'run.failed',
    'run.cancelled',
  ]

  for (const kind of kinds) {
    eventSource.addEventListener(kind, (event) => {
      const messageEvent = event as MessageEvent
      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(messageEvent.data)
      } catch {
        payload = { raw: messageEvent.data }
      }

      onEvent({
        id: Number(messageEvent.lastEventId || 0),
        runId,
        ts: new Date().toISOString(),
        kind,
        payload,
      })
    })
  }

  eventSource.onerror = () => {
    onError('Run stream disconnected. You can reopen run details to recover events.')
  }

  return () => {
    eventSource.close()
  }
}

export async function cancelRun(runId: string): Promise<void> {
  await postJson(`/v1/agent/runs/${runId}/cancel`, {})
}

export async function createCheckpoint(workspaceId: string, summary: string): Promise<{ id: string }> {
  return await postJson('/v1/checkpoints/create', {
    workspaceId,
    summary,
  })
}

export async function restoreCheckpoint(workspaceId: string, checkpointId: string): Promise<void> {
  await postJson('/v1/checkpoints/restore', {
    workspaceId,
    checkpointId,
  })
}

async function getJson(route: string): Promise<any> {
  const response = await fetch(`${BRIDGE_URL}${route}`, {
    method: 'GET',
    headers: headers(false),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Request failed (${response.status})`)
  }

  return await response.json()
}

async function postJson(route: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${BRIDGE_URL}${route}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(bodyText || `Request failed (${response.status})`)
  }

  return await response.json()
}
