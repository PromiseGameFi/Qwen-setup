import clsx from 'clsx'
import { ExternalLink, ShieldCheck, X } from 'lucide-react'

import type { Citation } from '../../types/chat'

interface CitationsDrawerProps {
  open: boolean
  citations: Citation[]
  onClose: () => void
}

export function CitationsDrawer({ open, citations, onClose }: CitationsDrawerProps) {
  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-5 shadow-2xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-serif text-2xl text-[var(--text-primary)]">Citations</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Claim-to-source map from the active run.</p>
          </div>

          <button
            aria-label="Close citations"
            className="rounded-full p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {citations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--surface-stroke)] bg-white px-4 py-5 text-sm text-[var(--text-muted)]">
            No citations collected yet for this run.
          </div>
        ) : (
          <div className="space-y-3">
            {citations.map((citation) => (
              <article
                className="rounded-xl border border-[var(--surface-stroke)] bg-white p-3"
                key={`${citation.sourceId}-${citation.url}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-[var(--text-primary)]">
                    [{citation.sourceId}] {citation.title}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                    <ShieldCheck size={11} />
                    {(citation.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                <p className="text-xs text-[var(--text-dim)]">{citation.claimRef}</p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{citation.snippet || 'No snippet captured.'}</p>

                <a
                  className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--accent-strong)] underline decoration-[var(--accent-strong)]/30 underline-offset-2"
                  href={citation.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open source
                  <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
