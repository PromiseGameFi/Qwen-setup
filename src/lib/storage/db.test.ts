import { beforeEach, describe, expect, it } from 'vitest'

import { db } from './db'

describe('db tables', () => {
  beforeEach(async () => {
    await db.threads.clear()
    await db.messages.clear()
    await db.settings.clear()
  })

  it('stores and retrieves threads/messages/settings', async () => {
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
        uiDensity: 'comfortable',
        schemaVersion: 1,
      },
    })

    expect(await db.threads.count()).toBe(1)
    expect(await db.messages.where('threadId').equals('thread-1').count()).toBe(1)
    expect(await db.settings.get('app')).toBeTruthy()
  })
})
