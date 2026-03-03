import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  parseSseDataLine,
  streamChatCompletion,
  type ParsedDataLine,
} from './openaiClient'

describe('parseSseDataLine', () => {
  it('parses DONE marker', () => {
    expect(parseSseDataLine('data: [DONE]')).toBe('DONE')
  })

  it('parses valid JSON chunk', () => {
    const parsed = parseSseDataLine(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
    ) as ParsedDataLine

    expect(parsed).toEqual({
      choices: [{ delta: { content: 'Hello' } }],
    })
  })

  it('returns null for non-data lines', () => {
    expect(parseSseDataLine('event: ping')).toBeNull()
  })
})

describe('streamChatCompletion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streams and combines assistant deltas', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
        )
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    )

    const chunks: string[] = []
    const result = await streamChatCompletion({
      config: {
        preset: 'custom',
        baseUrl: 'http://127.0.0.1:1234/v1',
        model: 'Qwen3.5-9B',
        temperature: 0.7,
        maxTokens: 256,
        stream: true,
      },
      messages: [{ role: 'user', content: 'Hi' }],
      onDelta: (delta) => chunks.push(delta),
    })

    expect(chunks.join('')).toBe('Hello world')
    expect(result).toBe('Hello world')
  })

  it('returns actionable endpoint error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(
      streamChatCompletion({
        config: {
          preset: 'custom',
          baseUrl: 'http://127.0.0.1:1234/v1',
          model: 'Qwen3.5-9B',
          temperature: 0.7,
          maxTokens: 256,
          stream: true,
        },
        messages: [{ role: 'user', content: 'Hi' }],
        onDelta: vi.fn(),
      }),
    ).rejects.toThrow('Cannot reach http://127.0.0.1:1234/v1/chat/completions.')
  })
})
