import fs from 'node:fs'
import path from 'node:path'

import Fastify from 'fastify'
import cors from '@fastify/cors'

import {
  AgentRunRequestSchema,
  type AgentRunEvent,
  PairingRequestSchema,
  type BridgePingResponse,
  WorkspaceCommandRequestSchema,
  WorkspaceFileWriteRequestSchema,
  WorkspaceOpenRequestSchema,
} from '@webide/protocol'
import { loadDefaultKnowledgeManifest } from '@webide/knowledge-pack'

import { AgentRunner } from './agentRunner.js'
import { createWorkspaceCheckpoint, restoreWorkspaceCheckpoint } from './checkpoints.js'
import { evaluateCommandPolicy, evaluateNetworkAllowlist } from './commandPolicy.js'
import { executeGuardedCommand } from './commandRunner.js'
import { loadBridgeConfig } from './config.js'
import { ModelManager } from './modelManager.js'
import { RunSseHub, formatSse } from './sse.js'
import { BridgeStore } from './store.js'
import type { PairingToken, WorkspaceRecord } from './types.js'
import { makeId, nowIso } from './utils.js'
import { buildWorkspaceTree, normalizeWorkspacePath, resolveWorkspaceFilePath } from './workspace.js'

const config = loadBridgeConfig()
const store = new BridgeStore(config.appDataDir)
const modelManager = new ModelManager(config)
const sseHub = new RunSseHub()
const knowledgeManifest = loadDefaultKnowledgeManifest()
const agentRunner = new AgentRunner()

const checkpointsDir = path.join(config.appDataDir, 'checkpoints')

const pairingTokens = new Map<string, PairingToken>()

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin: true,
  credentials: true,
})

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

app.addHook('onRequest', async (request, reply) => {
  if (!mutatingMethods.has(request.method)) {
    return
  }

  if (request.url.startsWith('/v1/pairing/request')) {
    return
  }

  const token = request.headers['x-webide-token']
  const resolvedToken = Array.isArray(token) ? token[0] : token

  if (!resolvedToken) {
    return reply.status(401).send({
      error: 'Missing pairing token. Call /v1/pairing/request first.',
    })
  }

  const pairing = pairingTokens.get(resolvedToken)
  if (!pairing) {
    return reply.status(401).send({
      error: 'Invalid pairing token.',
    })
  }

  if (Date.now() > pairing.expiresAt) {
    pairingTokens.delete(resolvedToken)
    return reply.status(401).send({
      error: 'Pairing token expired.',
    })
  }

  const requestOrigin = request.headers.origin
  if (requestOrigin && requestOrigin !== pairing.origin) {
    return reply.status(403).send({
      error: 'Origin mismatch for pairing token.',
    })
  }
})

app.get('/v1/ping', async () => {
  const response: BridgePingResponse = {
    ok: true,
    service: 'webide-bridge',
    version: config.version,
    time: nowIso(),
    pairingRequired: true,
  }

  return response
})

app.post('/v1/pairing/request', async (request, reply) => {
  const parsed = PairingRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.flatten(),
    })
  }

  if (!config.allowedOrigins.includes(parsed.data.origin)) {
    return reply.status(403).send({
      error: `Origin ${parsed.data.origin} is not in WEBIDE_ALLOWED_ORIGINS allowlist.`,
    })
  }

  const token = makeId('pair')
  const expiresAt = Date.now() + config.pairingTokenTtlMs

  pairingTokens.set(token, {
    token,
    origin: parsed.data.origin,
    expiresAt,
  })

  return {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  }
})

app.get('/v1/system/status', async () => {
  const modelStatus = await modelManager.getStatus()

  return {
    os: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cwd: process.cwd(),
    },
    bridge: {
      host: config.host,
      port: config.port,
      version: config.version,
      appDataDir: config.appDataDir,
      time: nowIso(),
    },
    runner: {
      sandboxed: true,
      timeoutMs: config.commandTimeoutMs,
      memoryMb: config.commandMemoryMb,
      cpuSeconds: config.commandCpuSeconds,
      maxConcurrentCommands: config.maxConcurrentCommands,
    },
    knowledgePack: {
      version: knowledgeManifest.version,
      installedAt: knowledgeManifest.installedAt,
      sources: knowledgeManifest.sources,
      embeddingVersion: knowledgeManifest.embeddingVersion,
    },
    model: modelStatus,
  }
})

app.get('/v1/model/status', async () => {
  return await modelManager.getStatus()
})

app.post('/v1/model/ensure', async () => {
  return await modelManager.ensureModel()
})

app.post('/v1/model/start', async () => {
  return await modelManager.startModel()
})

app.post('/v1/model/stop', async () => {
  return await modelManager.stopModel()
})

app.post('/v1/workspaces/open', async (request, reply) => {
  const parsed = WorkspaceOpenRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.flatten(),
    })
  }

  const rootPath = normalizeWorkspacePath(parsed.data.rootPath)
  const existing = store.listWorkspaces().find((workspace: WorkspaceRecord) => workspace.rootPath === rootPath)

  if (existing) {
    return existing
  }

  const now = nowIso()
  const workspace: WorkspaceRecord = {
    id: makeId('ws'),
    rootPath,
    label: parsed.data.label?.trim() || path.basename(rootPath) || rootPath,
    createdAt: now,
    updatedAt: now,
  }

  store.upsertWorkspace(workspace)
  return workspace
})

app.get('/v1/workspaces', async () => {
  return {
    items: store.listWorkspaces(),
  }
})

app.get('/v1/workspaces/:id/tree', async (request, reply) => {
  const workspaceId = (request.params as { id?: string }).id
  if (!workspaceId) {
    return reply.status(400).send({ error: 'Workspace id is required.' })
  }

  const workspace = store.getWorkspace(workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const tree = buildWorkspaceTree(workspace.rootPath)
  return {
    workspace,
    tree,
  }
})

app.get('/v1/workspaces/:id/file', async (request, reply) => {
  const workspaceId = (request.params as { id?: string }).id
  const relativePath = (request.query as { path?: string }).path

  if (!workspaceId || !relativePath) {
    return reply.status(400).send({ error: 'Workspace id and file path are required.' })
  }

  const workspace = store.getWorkspace(workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const fullPath = resolveWorkspaceFilePath(workspace, relativePath)
  if (!fs.existsSync(fullPath)) {
    return reply.status(404).send({ error: 'File not found.' })
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  return {
    path: relativePath,
    content,
    bytes: Buffer.byteLength(content, 'utf8'),
  }
})

app.put('/v1/workspaces/:id/file', async (request, reply) => {
  const workspaceId = (request.params as { id?: string }).id
  if (!workspaceId) {
    return reply.status(400).send({ error: 'Workspace id is required.' })
  }

  const parsed = WorkspaceFileWriteRequestSchema.safeParse({
    ...(request.body as Record<string, unknown>),
    workspaceId,
  })

  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() })
  }

  const workspace = store.getWorkspace(workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const targetPath = resolveWorkspaceFilePath(workspace, parsed.data.path)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, parsed.data.content, 'utf8')

  return {
    ok: true,
    path: parsed.data.path,
    bytes: Buffer.byteLength(parsed.data.content, 'utf8'),
  }
})

app.post('/v1/workspaces/:id/commands', async (request, reply) => {
  const workspaceId = (request.params as { id?: string }).id
  if (!workspaceId) {
    return reply.status(400).send({ error: 'Workspace id is required.' })
  }

  const parsed = WorkspaceCommandRequestSchema.safeParse({
    ...(request.body as Record<string, unknown>),
    workspaceId,
  })

  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() })
  }

  const workspace = store.getWorkspace(workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const networkPolicy = evaluateNetworkAllowlist(parsed.data.command, config.networkAllowlist)
  const policy = networkPolicy ?? evaluateCommandPolicy(parsed.data.command)

  if (policy.action === 'deny') {
    return reply.status(403).send({
      ok: false,
      denied: true,
      policy,
    })
  }

  if (policy.action === 'confirm' && !parsed.data.confirmed) {
    return reply.status(409).send({
      ok: false,
      confirmationRequired: true,
      policy,
    })
  }

  const result = await executeGuardedCommand({
    workspace,
    command: parsed.data.command,
    timeoutMs: parsed.data.timeoutMs,
  })

  return {
    ok: true,
    policy,
    result,
  }
})

app.post('/v1/checkpoints/create', async (request, reply) => {
  const workspaceId = (request.body as { workspaceId?: string; summary?: string })?.workspaceId
  const summary = (request.body as { summary?: string })?.summary?.trim() || 'Manual checkpoint'

  if (!workspaceId) {
    return reply.status(400).send({ error: 'workspaceId is required.' })
  }

  const workspace = store.getWorkspace(workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const checkpoint = await createWorkspaceCheckpoint(checkpointsDir, workspace, summary)
  store.createCheckpoint(checkpoint)

  return checkpoint
})

app.post('/v1/checkpoints/restore', async (request, reply) => {
  const payload = request.body as {
    workspaceId?: string
    checkpointId?: string
  }

  if (!payload.workspaceId || !payload.checkpointId) {
    return reply.status(400).send({ error: 'workspaceId and checkpointId are required.' })
  }

  const workspace = store.getWorkspace(payload.workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const checkpoint = store.getCheckpoint(payload.checkpointId)
  if (!checkpoint || checkpoint.workspaceId !== workspace.id) {
    return reply.status(404).send({ error: 'Checkpoint not found.' })
  }

  await restoreWorkspaceCheckpoint(workspace, checkpoint.archivePath)

  return {
    ok: true,
    checkpoint,
  }
})

app.post('/v1/agent/runs', async (request, reply) => {
  const parsed = AgentRunRequestSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.flatten(),
    })
  }

  const workspace = store.getWorkspace(parsed.data.workspaceId)
  if (!workspace) {
    return reply.status(404).send({ error: 'Workspace not found.' })
  }

  const run = await agentRunner.start({
    request: parsed.data,
    workspace,
    checkpointsDir,
    store,
    knowledgeManifest,
    modelEndpoint: modelManager.modelEndpoint(),
    modelApiKey: config.modelApiKey,
    networkAllowlist: config.networkAllowlist,
    onEvent: (event: AgentRunEvent) => {
      sseHub.publish(event)
    },
  })

  return {
    runId: run.id,
    status: run.status,
    createdAt: run.createdAt,
  }
})

app.get('/v1/agent/runs/:id', async (request, reply) => {
  const runId = (request.params as { id?: string }).id
  if (!runId) {
    return reply.status(400).send({ error: 'Run id is required.' })
  }

  const run = store.getRun(runId)
  if (!run) {
    return reply.status(404).send({ error: 'Run not found.' })
  }

  return {
    run,
    events: store.listRunEvents(runId),
  }
})

app.get('/v1/agent/runs/:id/events', async (request, reply) => {
  const runId = (request.params as { id?: string }).id
  const afterIdRaw = (request.query as { afterId?: string }).afterId
  const afterId = afterIdRaw ? Number.parseInt(afterIdRaw, 10) : undefined

  if (!runId) {
    return reply.status(400).send({ error: 'Run id is required.' })
  }

  const run = store.getRun(runId)
  if (!run) {
    return reply.status(404).send({ error: 'Run not found.' })
  }

  return {
    runId,
    events: store.listRunEvents(runId, afterId),
  }
})

app.get('/v1/agent/runs/:id/stream', async (request, reply) => {
  const runId = (request.params as { id?: string }).id

  if (!runId) {
    return reply.status(400).send({ error: 'Run id is required.' })
  }

  const run = store.getRun(runId)
  if (!run) {
    return reply.status(404).send({ error: 'Run not found.' })
  }

  const afterIdQuery = (request.query as { afterId?: string }).afterId
  const afterId = afterIdQuery ? Number.parseInt(afterIdQuery, 10) : undefined

  reply.hijack()

  const response = reply.raw
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  response.write('retry: 1500\n\n')

  const events = store.listRunEvents(runId, afterId)
  for (const event of events) {
    response.write(formatSse(event))
  }

  sseHub.subscribe(runId, response)

  const timer = setInterval(() => {
    if (response.writableEnded || response.destroyed) {
      return
    }

    response.write(': keepalive\n\n')
  }, 10000)

  request.raw.on('close', () => {
    clearInterval(timer)
    sseHub.unsubscribe(runId, response)

    if (!response.writableEnded) {
      response.end()
    }
  })
})

app.post('/v1/agent/runs/:id/cancel', async (request, reply) => {
  const runId = (request.params as { id?: string }).id

  if (!runId) {
    return reply.status(400).send({ error: 'Run id is required.' })
  }

  const cancelled = agentRunner.cancel(runId)
  if (!cancelled) {
    return reply.status(404).send({
      error: 'Run not active or not found.',
    })
  }

  return {
    runId,
    cancelled: true,
  }
})

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error)
  const message = error instanceof Error ? error.message : 'Internal server error.'
  return reply.status(500).send({
    error: message,
  })
})

const closeHandler = async (): Promise<void> => {
  await modelManager.stopModel().catch(() => {})
  store.close()
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => {
  void closeHandler()
})

process.on('SIGTERM', () => {
  void closeHandler()
})

await app.listen({
  host: config.host,
  port: config.port,
})

app.log.info(`WebIDE bridge listening at http://${config.host}:${config.port}`)
