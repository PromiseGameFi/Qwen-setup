import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'

describe('db tables', () => {
  beforeEach(async () => {
    await db.threads.clear()
    await db.messages.clear()
    await db.settings.clear()
    await db.runs.clear()
  })

  it('stores and retrieves threads/messages/settings/runs', async () => {
    const now = new Date().toISOString()

    await db.threads.put({
      id: 'thread-1',
      title: 'Thread',
      createdAt: now,
      updatedAt: now,
      model: 'Qwen3.5-9B',
    })

    await db.messages.put({
      id: 'msg-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Hello',
      createdAt: now,
      status: 'complete',
    })

    await db.runs.put({
      id: 'run-1',
      threadId: 'thread-1',
      mode: 'agent',
      prompt: 'hello',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      citations: [],
      artifact: {
        plan: [],
        toolTrace: [],
        evidenceTable: [],
        agentOutputs: [],
        finalAnswer: 'done',
      },
      metrics: {},
      timeline: [],
    })

    await db.settings.put({
      key: 'app',
      value: {
        provider: {
          preset: 'lmstudio',
          baseUrl: 'http://127.0.0.1:1234/v1',
          apiKey: '',
          model: 'Qwen3.5-9B',
          temperature: 0.7,
          maxTokens: 512,
          stream: true,
        },
        runtime: {
          sidecarBaseUrl: 'http://127.0.0.1:8787',
          defaultMode: 'chat',
          runConfig: {
            maxSteps: 8,
            maxSources: 6,
            timeBudgetSec: 180,
            swarmMaxAgents: 4,
            thinkingPasses: 3,
          },
          providerKeys: {
            tavilyApiKey: '',
            braveApiKey: '',
          },
        },
        uiDensity: 'comfortable',
        schemaVersion: 2,
      },
    })

    expect(await db.threads.count()).toBe(1)
    expect(await db.messages.where('threadId').equals('thread-1').count()).toBe(1)
    expect(await db.settings.get('app')).toBeTruthy()
    expect(await db.runs.count()).toBe(1)
  })
})
