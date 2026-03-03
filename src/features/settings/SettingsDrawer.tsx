import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Download, Gauge, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'

import {
  PROVIDER_PRESETS,
  type AppSettings,
  type BenchmarkReport,
  type ProviderConfig,
  type ProviderPreset,
  type UiDensity,
} from '../../types/chat'

interface SettingsDrawerProps {
  open: boolean
  settings: AppSettings
  benchmarkReport: BenchmarkReport | null
  benchmarkLoading: boolean
  onClose: () => void
  onProviderChange: (update: Partial<ProviderConfig>) => Promise<void>
  onProviderKeysChange: (update: { tavilyApiKey?: string; braveApiKey?: string }) => Promise<void>
  onDensityChange: (density: UiDensity) => Promise<void>
  onSidecarBaseUrlChange: (baseUrl: string) => Promise<void>
  onRunBenchmarks: () => Promise<void>
  onRefreshBenchmark: () => Promise<void>
  onExport: () => Promise<void>
  onImport: (file: File) => Promise<void>
  onClearAll: () => Promise<void>
}

export function SettingsDrawer({
  open,
  settings,
  benchmarkReport,
  benchmarkLoading,
  onClose,
  onProviderChange,
  onProviderKeysChange,
  onDensityChange,
  onSidecarBaseUrlChange,
  onRunBenchmarks,
  onRefreshBenchmark,
  onExport,
  onImport,
  onClearAll,
}: SettingsDrawerProps) {
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePresetChange = async (preset: ProviderPreset): Promise<void> => {
    if (preset === 'custom') {
      await onProviderChange({ preset })
      return
    }

    const selectedPreset = PROVIDER_PRESETS.find((entry) => entry.id === preset)
    await onProviderChange({
      preset,
      baseUrl: selectedPreset?.baseUrl ?? settings.provider.baseUrl,
    })
  }

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={clsx(
          'fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-5 shadow-2xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-serif text-2xl text-[var(--text-primary)]">Settings</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Configure local model + sidecar orchestration.
            </p>
          </div>
          <button
            aria-label="Close settings"
            className="rounded-full p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <section className="space-y-4 rounded-2xl border border-[var(--surface-stroke)] bg-white p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-[var(--text-muted)]" />
            <p className="font-medium text-[var(--text-primary)]">Model Provider</p>
          </div>

          <label className="block text-sm text-[var(--text-muted)]">
            Preset
            <select
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void handlePresetChange(event.target.value as ProviderPreset)
              }}
              value={settings.provider.preset}
            >
              {PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="block text-sm text-[var(--text-muted)]">
            Base URL
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onProviderChange({ baseUrl: event.target.value })
              }}
              placeholder="http://127.0.0.1:1234/v1"
              value={settings.provider.baseUrl}
            />
          </label>
          {settings.provider.preset === 'hf_space' ? (
            <p className="rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
              Use your Space URL in OpenAI format, for example:
              {' '}
              <code>https://your-space-name.hf.space/v1</code>
            </p>
          ) : null}

          <label className="block text-sm text-[var(--text-muted)]">
            Model Name
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onProviderChange({ model: event.target.value })
              }}
              placeholder={
                settings.provider.preset === 'hf_space'
                  ? 'Qwen3.5-0.8B-Q4_K_M.gguf'
                  : 'Qwen3.5-9B'
              }
              value={settings.provider.model}
            />
          </label>

          <label className="block text-sm text-[var(--text-muted)]">
            API Key (optional)
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onProviderChange({ apiKey: event.target.value })
              }}
              placeholder={settings.provider.preset === 'hf_space' ? 'hf_... (optional)' : 'sk-...'}
              value={settings.provider.apiKey ?? ''}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-[var(--text-muted)]">
              Temperature
              <input
                className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
                max={2}
                min={0}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value)
                  if (!Number.isNaN(next)) {
                    void onProviderChange({ temperature: next })
                  }
                }}
                step={0.1}
                type="number"
                value={settings.provider.temperature}
              />
            </label>

            <label className="block text-sm text-[var(--text-muted)]">
              Max Tokens
              <input
                className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
                min={1}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10)
                  if (!Number.isNaN(next)) {
                    void onProviderChange({ maxTokens: next })
                  }
                }}
                step={1}
                type="number"
                value={settings.provider.maxTokens}
              />
            </label>
          </div>

          <label className="block text-sm text-[var(--text-muted)]">
            Density
            <select
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onDensityChange(event.target.value as UiDensity)
              }}
              value={settings.uiDensity}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </section>

        <section className="mt-5 space-y-4 rounded-2xl border border-[var(--surface-stroke)] bg-white p-4">
          <p className="font-medium text-[var(--text-primary)]">Agent Runtime</p>

          <label className="block text-sm text-[var(--text-muted)]">
            Sidecar Base URL
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onSidecarBaseUrlChange(event.target.value)
              }}
              placeholder="http://127.0.0.1:8787"
              value={settings.runtime.sidecarBaseUrl}
            />
          </label>

          <label className="block text-sm text-[var(--text-muted)]">
            Tavily API Key (optional)
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onProviderKeysChange({ tavilyApiKey: event.target.value })
              }}
              placeholder="tvly-..."
              value={settings.runtime.providerKeys.tavilyApiKey ?? ''}
            />
          </label>

          <label className="block text-sm text-[var(--text-muted)]">
            Brave API Key (optional)
            <input
              className="mt-1 w-full rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-primary)] outline-none"
              onChange={(event) => {
                void onProviderKeysChange({ braveApiKey: event.target.value })
              }}
              placeholder="brv-..."
              value={settings.runtime.providerKeys.braveApiKey ?? ''}
            />
          </label>
        </section>

        <section className="mt-5 space-y-3 rounded-2xl border border-[var(--surface-stroke)] bg-white p-4">
          <div className="flex items-center gap-2">
            <Gauge size={15} className="text-[var(--text-muted)]" />
            <p className="font-medium text-[var(--text-primary)]">Benchmark Gate</p>
          </div>

          <div className="rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
            {benchmarkReport ? (
              <>
                <p>
                  Latest: {new Date(benchmarkReport.generatedAt).toLocaleString()} -{' '}
                  <strong className={benchmarkReport.gatePassed ? 'text-green-700' : 'text-red-700'}>
                    {benchmarkReport.gatePassed ? 'PASS' : 'FAIL'}
                  </strong>
                </p>
                <p className="mt-1">
                  Agent {Math.round((benchmarkReport.modes.agent.metrics.taskSuccessRate ?? 0) * 100)}% |
                  Deep Research {Math.round((benchmarkReport.modes.deepResearch.metrics.citationCoverage ?? 0) * 100)}% coverage
                </p>
              </>
            ) : (
              <p>No benchmark report available yet.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="inline-flex items-center justify-center rounded-lg border border-[var(--surface-stroke)] px-3 py-2 text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
              disabled={benchmarkLoading}
              onClick={() => {
                void onRefreshBenchmark()
              }}
              type="button"
            >
              Refresh
            </button>

            <button
              className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-strong)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              disabled={benchmarkLoading}
              onClick={() => {
                void onRunBenchmarks()
              }}
              type="button"
            >
              {benchmarkLoading ? 'Running...' : 'Run Benchmark'}
            </button>
          </div>
        </section>

        <section className="mt-5 space-y-3 rounded-2xl border border-[var(--surface-stroke)] bg-white p-4">
          <p className="font-medium text-[var(--text-primary)]">Data Management</p>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--surface-stroke)] px-3 py-2 text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onExport()
              } finally {
                setBusy(false)
              }
            }}
            type="button"
          >
            <Download size={14} />
            Export Chats
          </button>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--surface-stroke)] px-3 py-2 text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload size={14} />
            Import Chats
          </button>

          <input
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void (async () => {
                  setBusy(true)
                  try {
                    await onImport(file)
                  } finally {
                    setBusy(false)
                    event.target.value = ''
                  }
                })()
              }
            }}
            ref={fileInputRef}
            type="file"
          />

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              const approved = window.confirm('Clear all chats from local storage?')
              if (!approved) {
                return
              }

              setBusy(true)
              try {
                await onClearAll()
              } finally {
                setBusy(false)
              }
            }}
            type="button"
          >
            <Trash2 size={14} />
            Clear All Local Chats
          </button>
        </section>
      </aside>
    </>
  )
}
