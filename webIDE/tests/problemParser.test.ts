import { describe, expect, it } from 'vitest'

import type { AgentRunEvent } from '@webide/protocol'

import { deriveProblems } from '../apps/web/src/lib/problemParser'

describe('deriveProblems', () => {
  it('extracts terminal and agent problems', () => {
    const commandOutput = [
      'src/main.ts:12:7 error Unexpected any',
      'warning: deprecated API usage',
    ].join('\n')

    const events: AgentRunEvent[] = [
      {
        id: 1,
        runId: 'run-1',
        ts: new Date().toISOString(),
        kind: 'run.failed',
        payload: {
          message: 'Agent synthesis failed.',
        },
      },
    ]

    const problems = deriveProblems(commandOutput, events)

    expect(problems.some((item) => item.source === 'terminal' && item.severity === 'error')).toBe(true)
    expect(problems.some((item) => item.source === 'terminal' && item.severity === 'warning')).toBe(true)
    expect(problems.some((item) => item.source === 'agent' && item.severity === 'error')).toBe(true)
  })
})
