import { afterEach, describe, expect, it, vi } from 'vitest'

import { getRuntimeHealth, streamRun } from './agentRuntimeClient'
import type { RunTimelineEvent } from '../../types/chat'

function buildSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
    },
  })
}

describe('streamRun', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses events and ignores keepalive comments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      buildSseResponse([
        ': keepalive\n\n',
        'id: 1\nevent: draft.delta\ndata: {"delta":"Hello"}\n\n',
        ': keepalive\n\n',
        'id: 2\nevent: run.completed\ndata: {"done":true}\n\n',
      ]),
    )

    vi.stubGlobal('fetch', fetchMock)

    const events: RunTimelineEvent[] = []
    const result = await streamRun({
      runId: 'run-keepalive',
      sidecarBaseUrl: 'http://127.0.0.1:8787',
      onEvent: (event) => events.push(event),
    })

    expect(events).toHaveLength(2)
    expect(events.map((event) => event.id)).toEqual([1, 2])
    expect(result.lastEventId).toBe(2)
    expect(result.terminalEvent).toBe('run.completed')
  })

  it('reconnects and resumes stream from Last-Event-ID', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === 'function') {
          handler()
        }
        return 0 as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
    )

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildSseResponse(['id: 1\nevent: draft.delta\ndata: {"delta":"first"}\n\n']),
      )
      .mockResolvedValueOnce(
        buildSseResponse(['id: 2\nevent: run.completed\ndata: {"done":true}\n\n']),
      )

    vi.stubGlobal('fetch', fetchMock)

    const events: RunTimelineEvent[] = []
    const result = await streamRun({
      runId: 'run-resume',
      sidecarBaseUrl: 'http://127.0.0.1:8787',
      onEvent: (event) => events.push(event),
      maxReconnects: 2,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/runs/run-resume/stream?afterId=1')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        Accept: 'text/event-stream',
        'Last-Event-ID': '1',
      },
    })
    expect(events.map((event) => event.id)).toEqual([1, 2])
    expect(result.lastEventId).toBe(2)
    expect(result.reconnectCount).toBe(1)
  })
})

describe('getRuntimeHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns offline status when sidecar is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await getRuntimeHealth('http://127.0.0.1:8787')

    expect(result.status).toBe('offline')
    expect(result.message).toContain('npm run dev:all')
  })
})
