import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Composer } from './Composer'

function renderComposer(onSend = vi.fn()) {
  render(
    <Composer
      canRegenerate={false}
      mode="chat"
      onModeChange={vi.fn()}
      onRegenerate={vi.fn()}
      onRunConfigChange={vi.fn()}
      onSend={onSend}
      onStop={vi.fn()}
      runConfig={{
        maxSteps: 8,
        maxSources: 6,
        timeBudgetSec: 180,
        swarmMaxAgents: 4,
        thinkingPasses: 3,
      }}
      sending={false}
    />,
  )
}

describe('Composer', () => {
  it('submits on Enter', () => {
    const onSend = vi.fn()

    renderComposer(onSend)

    const input = screen.getByPlaceholderText('Message Qwen locally...')
    fireEvent.change(input, { target: { value: 'Hello world' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('Hello world')
  })

  it('does not submit on Shift+Enter', () => {
    const onSend = vi.fn()

    renderComposer(onSend)

    const input = screen.getByPlaceholderText('Message Qwen locally...')
    fireEvent.change(input, { target: { value: 'Hello world' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })
})
