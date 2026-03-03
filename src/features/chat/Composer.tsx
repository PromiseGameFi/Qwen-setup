import { useMemo, useState } from 'react'
import { ChevronDown, CornerDownLeft, RefreshCcw, Settings2, Square } from 'lucide-react'
import TextareaAutosize from 'react-textarea-autosize'

import {
  MODE_LABELS,
  type ModeType,
  type RunConfig,
  type RuntimeHealthStatus,
} from '../../types/chat'

interface ComposerProps {
  sending: boolean
  disabled?: boolean
  mode: ModeType
  runConfig: RunConfig
  runtimeHealth: RuntimeHealthStatus
  runtimeHealthMessage: string | null
  onModeChange: (mode: ModeType) => void
  onRunConfigChange: (update: Partial<RunConfig>) => void
  onSend: (prompt: string) => void
  onStop: () => void
  onRegenerate: () => void
  canRegenerate: boolean
}

export function Composer({
  sending,
  disabled,
  mode,
  runConfig,
  runtimeHealth,
  runtimeHealthMessage,
  onModeChange,
  onRunConfigChange,
  onSend,
  onStop,
  onRegenerate,
  canRegenerate,
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const modeOptions = useMemo(() => Object.entries(MODE_LABELS) as Array<[ModeType, string]>, [])

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
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--surface-stroke)] pb-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--text-muted)]">
            <span>Mode</span>
            <select
              className="bg-transparent text-sm text-[var(--text-primary)] outline-none"
              disabled={sending || disabled}
              onChange={(event) => onModeChange(event.target.value as ModeType)}
              value={mode}
            >
              {modeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--surface-stroke)] px-2 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-soft)]"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            <Settings2 size={13} />
            Run Config
            <ChevronDown
              className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              size={13}
            />
          </button>

          <span
            className={
              runtimeHealth === 'online'
                ? 'inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700'
                : runtimeHealth === 'degraded'
                  ? 'inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700'
                  : 'inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700'
            }
            title={runtimeHealthMessage ?? undefined}
          >
            Runtime {runtimeHealth === 'online' ? 'Online' : runtimeHealth === 'degraded' ? 'Degraded' : 'Offline'}
          </span>
        </div>

        {advancedOpen ? (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-2 text-xs sm:grid-cols-5">
            <ConfigField
              label="Max steps"
              onChange={(value) => onRunConfigChange({ maxSteps: value })}
              value={runConfig.maxSteps}
            />
            <ConfigField
              label="Sources"
              onChange={(value) => onRunConfigChange({ maxSources: value })}
              value={runConfig.maxSources}
            />
            <ConfigField
              label="Budget (s)"
              onChange={(value) => onRunConfigChange({ timeBudgetSec: value })}
              value={runConfig.timeBudgetSec}
            />
            <ConfigField
              label="Swarm agents"
              onChange={(value) => onRunConfigChange({ swarmMaxAgents: value })}
              value={runConfig.swarmMaxAgents}
            />
            <ConfigField
              label="Think passes"
              onChange={(value) => onRunConfigChange({ thinkingPasses: value })}
              value={runConfig.thinkingPasses}
            />
          </div>
        ) : null}

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

interface ConfigFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
}

function ConfigField({ label, value, onChange }: ConfigFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-[var(--text-muted)]">
      <span>{label}</span>
      <input
        className="rounded-md border border-[var(--surface-stroke)] bg-white px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
        min={1}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10)
          if (!Number.isNaN(next)) {
            onChange(next)
          }
        }}
        step={1}
        type="number"
        value={value}
      />
    </label>
  )
}
