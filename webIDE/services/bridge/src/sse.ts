import type { ServerResponse } from 'node:http'

import type { AgentRunEvent } from '@webide/protocol'

export class RunSseHub {
  private readonly listeners = new Map<string, Set<ServerResponse>>()

  public subscribe(runId: string, response: ServerResponse): void {
    const current = this.listeners.get(runId) ?? new Set<ServerResponse>()
    current.add(response)
    this.listeners.set(runId, current)
  }

  public unsubscribe(runId: string, response: ServerResponse): void {
    const current = this.listeners.get(runId)
    if (!current) {
      return
    }

    current.delete(response)
    if (current.size === 0) {
      this.listeners.delete(runId)
    }
  }

  public publish(event: AgentRunEvent): void {
    const listeners = this.listeners.get(event.runId)
    if (!listeners) {
      return
    }

    const payload = formatSse(event)
    for (const response of listeners) {
      if (response.writableEnded || response.destroyed) {
        continue
      }
      response.write(payload)
    }
  }
}

export function formatSse(event: AgentRunEvent): string {
  return [`id: ${event.id}`, `event: ${event.kind}`, `data: ${JSON.stringify(event.payload)}`, '', ''].join('\n')
}
