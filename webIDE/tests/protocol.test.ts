import { describe, expect, it } from 'vitest'

import { AgentRunRequestSchema, WorkspaceCommandRequestSchema } from '../packages/protocol/src'

describe('protocol schemas', () => {
  it('parses valid agent request', () => {
    const parsed = AgentRunRequestSchema.safeParse({
      workspaceId: 'ws-1',
      goal: 'Add tests',
      mode: 'execute',
      modelProfile: 'qwen3.5-9b-q4',
      autonomyLevel: 'full_autonomy',
      contextRefs: [],
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects empty command', () => {
    const parsed = WorkspaceCommandRequestSchema.safeParse({
      workspaceId: 'ws-1',
      command: '',
      confirmed: false,
      timeoutMs: 1000,
    })

    expect(parsed.success).toBe(false)
  })
})
