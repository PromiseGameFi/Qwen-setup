import { Clock3 } from 'lucide-react'

import type { RunTimelineEvent } from '../../types/chat'

interface RunTimelineProps {
  events: RunTimelineEvent[]
  running: boolean
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

export function RunTimeline({ events, running }: RunTimelineProps) {
  if (!running && events.length === 0) {
    return null
  }

  const recent = events.slice(-18)

  return (
    <section className="border-b border-[var(--surface-stroke)] bg-[var(--surface-soft)]/75 px-4 py-3 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Clock3 size={14} />
          Run Timeline {running ? '(live)' : ''}
        </div>

        <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[var(--surface-stroke)] bg-white/85 p-2 text-xs">
          {recent.length === 0 ? (
            <p className="text-[var(--text-dim)]">Waiting for sidecar events...</p>
          ) : (
            recent.map((event) => (
              <div className="grid grid-cols-[6rem,1fr] gap-2" key={`${event.id}-${event.event}`}>
                <span className="text-[var(--text-dim)]">{formatTime(event.createdAt)}</span>
                <span className="text-[var(--text-primary)]">
                  <strong>{event.event}</strong>{' '}
                  <EventSummary payload={event.payload} />
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function EventSummary({ payload }: { payload: Record<string, unknown> }) {
  const important = payload.message ?? payload.step ?? payload.name ?? payload.agent ?? payload.delta

  if (typeof important === 'string' && important.trim()) {
    return <>{important.slice(0, 200)}</>
  }

  if (typeof payload.ok === 'boolean') {
    return <>{payload.ok ? 'ok' : 'failed'}</>
  }

  return <>update</>
}
