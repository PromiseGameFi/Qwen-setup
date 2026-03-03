import { describe, expect, it } from 'vitest'

import { createExportBundle, parseExportBundle, serializeExportBundle } from './exportImport'

describe('export/import bundle', () => {
  it('serializes and parses valid payload', () => {
    const bundle = createExportBundle(
      [
        {
          id: 'thread-1',
          title: 'Thread',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: 'Qwen3.5-9B',
        },
      ],
      [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          role: 'user',
          content: 'hello',
          createdAt: new Date().toISOString(),
          status: 'complete',
        },
      ],
      {
        provider: {
          preset: 'custom',
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
      [
        {
          id: 'run-1',
          threadId: 'thread-1',
          mode: 'agent',
          prompt: 'hello',
          status: 'completed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        },
      ],
    )

    const parsed = parseExportBundle(serializeExportBundle(bundle))

    expect(parsed.version).toBe(1)
    expect(parsed.threads).toHaveLength(1)
    expect(parsed.messages).toHaveLength(1)
    expect(parsed.runs).toHaveLength(1)
  })

  it('throws for unsupported export version', () => {
    const invalid = JSON.stringify({ version: 2 })
    expect(() => parseExportBundle(invalid)).toThrow('Unsupported export version')
  })
})
