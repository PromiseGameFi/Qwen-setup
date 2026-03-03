import type { ServerResponse } from 'node:http'

import type { RunTimelineEvent } from './types'

export class RunSseHub {
  private readonly listeners = new Map<string, Set<ServerResponse>>()

  public subscribe(runId: string, response: ServerResponse): void {
    const bucket = this.listeners.get(runId) ?? new Set<ServerResponse>()
    bucket.add(response)
    this.listeners.set(runId, bucket)
  }

  public unsubscribe(runId: string, response: ServerResponse): void {
    const bucket = this.listeners.get(runId)
    if (!bucket) {
      return
    }

    bucket.delete(response)

    if (bucket.size === 0) {
      this.listeners.delete(runId)
    }
  }

  public publish(event: RunTimelineEvent): void {
    const bucket = this.listeners.get(event.runId)
    if (!bucket || bucket.size === 0) {
      return
    }

    const payload = formatSse(event)

    for (const response of bucket) {
      if (response.writableEnded || response.destroyed) {
        this.unsubscribe(event.runId, response)
        continue
      }

      response.write(payload)
    }
  }
}

export function formatSse(event: RunTimelineEvent): string {
  return [
    `id: ${event.id}`,
    `event: ${event.event}`,
    `data: ${JSON.stringify(event.payload)}`,
    '',
    '',
  ].join('\n')
}
