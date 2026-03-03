import Fastify from 'fastify'
import cors from '@fastify/cors'
import { z } from 'zod'

import { buildBenchmarkReport } from './bench'
import { loadProviderKeys, loadRuntimeConfig, saveProviderKeys } from './config'
import { RuntimeDatabase } from './db'
import { RunOrchestrator } from './orchestrator'
import { RunSseHub, formatSse } from './sse'
import { mergeRunConfig } from './types'
import type { CreateRunRequest, ModeType, ProviderKeys } from './types'

const runtimeConfig = loadRuntimeConfig()
const db = new RuntimeDatabase(runtimeConfig.databasePath)
const sseHub = new RunSseHub()

let providerKeys: ProviderKeys = loadProviderKeys(runtimeConfig.providerConfigPath)

const orchestrator = new RunOrchestrator({
  db,
  sseHub,
  defaultProviderKeys: providerKeys,
})

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin: true,
  credentials: true,
})

const modeSchema = z.enum(['chat', 'agent', 'deep_think', 'deep_research', 'swarm'] satisfies ModeType[])

const createRunSchema = z.object({
  threadId: z.string().min(1),
  mode: modeSchema,
  prompt: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
  modelConfig: z.object({
    baseUrl: z.string().url().or(z.string().startsWith('http://')).or(z.string().startsWith('https://')),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    temperature: z.number(),
    maxTokens: z.number().int().positive(),
  }),
  runConfig: z
    .object({
      maxSteps: z.number().int().positive().optional(),
      maxSources: z.number().int().positive().optional(),
      timeBudgetSec: z.number().int().positive().optional(),
      swarmMaxAgents: z.number().int().positive().optional(),
      thinkingPasses: z.number().int().positive().optional(),
    })
    .optional(),
  providerKeys: z
    .object({
      tavilyApiKey: z.string().optional(),
      braveApiKey: z.string().optional(),
    })
    .optional(),
})

app.get('/api/health', async () => {
  const endpoint = `${runtimeConfig.defaultModelBaseUrl.replace(/\/+$/, '')}/models`
  let modelReachable = false
  let message: string | undefined

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
    modelReachable = response.ok
    if (!response.ok) {
      message = `Model endpoint returned ${response.status}`
    }
  } catch (error) {
    modelReachable = false
    message = error instanceof Error ? error.message : 'Health probe failed'
  }

  return {
    ok: modelReachable,
    modelReachable,
    providers: {
      tavilyReady: Boolean(providerKeys.tavilyApiKey),
      braveReady: Boolean(providerKeys.braveApiKey),
    },
    diagnostics: {
      modelBaseUrl: runtimeConfig.defaultModelBaseUrl,
      endpoint,
      message,
    },
  }
})

app.post('/api/provider-keys', async (request, reply) => {
  const schema = z.object({
    tavilyApiKey: z.string().optional(),
    braveApiKey: z.string().optional(),
  })

  const parsed = schema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() })
  }

  providerKeys = {
    tavilyApiKey: parsed.data.tavilyApiKey?.trim() || undefined,
    braveApiKey: parsed.data.braveApiKey?.trim() || undefined,
  }

  saveProviderKeys(runtimeConfig.providerConfigPath, providerKeys)

  return {
    saved: true,
    providers: {
      tavilyReady: Boolean(providerKeys.tavilyApiKey),
      braveReady: Boolean(providerKeys.braveApiKey),
    },
  }
})

app.post('/api/runs', async (request, reply) => {
  const parsed = createRunSchema.safeParse(request.body)

  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.flatten(),
    })
  }

  const payload: CreateRunRequest = {
    ...parsed.data,
    runConfig: mergeRunConfig(parsed.data.runConfig),
  }

  const created = orchestrator.createRun(payload)
  return {
    runId: created.runId,
    status: created.status,
  }
})

app.get('/api/runs/:runId/stream', async (request, reply) => {
  const paramsSchema = z.object({
    runId: z.string().min(1),
  })

  const params = paramsSchema.parse(request.params)

  const history = orchestrator.listRunEvents(params.runId)

  reply.hijack()

  const response = reply.raw
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  response.write('retry: 1500\n\n')

  for (const event of history) {
    response.write(formatSse(event))
  }

  sseHub.subscribe(params.runId, response)

  request.raw.on('close', () => {
    sseHub.unsubscribe(params.runId, response)
    if (!response.writableEnded) {
      response.end()
    }
  })
})

app.post('/api/runs/:runId/cancel', async (request, reply) => {
  const paramsSchema = z.object({
    runId: z.string().min(1),
  })

  const params = paramsSchema.parse(request.params)
  const cancelled = orchestrator.cancelRun(params.runId)

  if (!cancelled) {
    return reply.status(404).send({
      error: 'Run not active or already completed.',
    })
  }

  return {
    runId: params.runId,
    cancelled: true,
  }
})

app.get('/api/runs/:runId', async (request, reply) => {
  const paramsSchema = z.object({
    runId: z.string().min(1),
  })

  const params = paramsSchema.parse(request.params)
  const run = db.getRun(params.runId)

  if (!run) {
    return reply.status(404).send({
      error: 'Run not found.',
    })
  }

  const events = db.listRunEvents(params.runId)

  return {
    ...run,
    events,
  }
})

app.post('/api/bench/run', async () => {
  const runs = db.listRuns(300)
  const report = buildBenchmarkReport(runs)
  db.saveBenchmarkReport(report)

  return report
})

app.get('/api/bench/latest', async (_request, reply) => {
  const report = db.getLatestBenchmarkReport()

  if (!report) {
    return reply.status(404).send({
      error: 'No benchmark report found.',
    })
  }

  return report
})

const closeHandler = async (): Promise<void> => {
  await app.close()
  db.close()
  process.exit(0)
}

process.on('SIGINT', () => {
  void closeHandler()
})

process.on('SIGTERM', () => {
  void closeHandler()
})

await app.listen({
  host: runtimeConfig.host,
  port: runtimeConfig.port,
})

app.log.info(
  `Agent runtime listening on http://${runtimeConfig.host}:${runtimeConfig.port}/api`,
)
