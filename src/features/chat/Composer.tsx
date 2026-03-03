import { useState } from 'react'
import { CornerDownLeft, RefreshCcw, Square } from 'lucide-react'
import TextareaAutosize from 'react-textarea-autosize'

interface ComposerProps {
  sending: boolean
  disabled?: boolean
  onSend: (prompt: string) => void
  onStop: () => void
  onRegenerate: () => void
  canRegenerate: boolean
}

export function Composer({
  sending,
  disabled,
  onSend,
  onStop,
  onRegenerate,
  canRegenerate,
}: ComposerProps) {
  const [draft, setDraft] = useState('')

  const handleSend = (): void => {
    const trimmed = draft.trim()
    if (!trimmed || sending || disabled) {
      return
    }

    onSend(trimmed)
    setDraft('')
  }

  return (
    <footer className="border-t border-[var(--surface-stroke)] bg-[var(--surface-soft)]/80 px-4 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-[var(--surface-stroke)] bg-white p-3 shadow-[0_15px_45px_rgba(48,37,17,0.09)]">
        <TextareaAutosize
          className="w-full resize-none border-none bg-transparent px-1 py-1 text-[0.98rem] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)]"
          disabled={disabled}
          maxRows={8}
          minRows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message Qwen locally..."
          value={draft}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-[var(--text-dim)]">
            Enter to send - Shift+Enter for newline - Cmd/Ctrl+, settings
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--surface-stroke)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canRegenerate || sending}
              onClick={onRegenerate}
              type="button"
            >
              <RefreshCcw size={13} />
              Regenerate
            </button>

            {sending ? (
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-[#b84d4d] bg-[#fce7e7] px-3 py-1.5 text-xs font-semibold text-[#842a2a] transition hover:bg-[#f9d6d6]"
                onClick={onStop}
                type="button"
              >
                <Square size={12} />
                Stop
              </button>
            ) : (
              <button
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-strong)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!draft.trim() || disabled}
                onClick={handleSend}
                type="button"
              >
                <CornerDownLeft size={13} />
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
