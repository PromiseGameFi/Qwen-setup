import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageBubble } from './MessageBubble'

let writeTextMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeTextMock = vi.fn().mockResolvedValue(undefined)

  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: writeTextMock,
    },
  })
})

describe('MessageBubble', () => {
  it('copies code blocks', async () => {
    render(
      <MessageBubble
        canRegenerate={false}
        isStreaming={false}
        message={{
          id: 'message-1',
          threadId: 'thread-1',
          role: 'assistant',
          content: `\`\`\`ts
console.log("hi")
\`\`\``,
          createdAt: new Date().toISOString(),
          status: 'complete',
        }}
        onRegenerate={vi.fn()}
      />,
    )

    const copyButton = screen.getByRole('button', { name: /copy/i })
    await act(async () => {
      fireEvent.click(copyButton)
    })

    expect(writeTextMock).toHaveBeenCalledWith('console.log("hi")')
  })
})
