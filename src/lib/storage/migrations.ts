import { DEFAULT_RUN_CONFIG, DEFAULT_SETTINGS, type AppSettings, type ModeType } from '../../types/chat'

export const CURRENT_SCHEMA_VERSION = 2 as const

export function normalizeSettings(settings: unknown): AppSettings {
  const source = isRecord(settings) ? settings : DEFAULT_SETTINGS
  const providerSource = isRecord(source.provider) ? source.provider : DEFAULT_SETTINGS.provider
  const runtimeSource = isRecord(source.runtime) ? source.runtime : DEFAULT_SETTINGS.runtime
  const providerKeysSource = isRecord(runtimeSource.providerKeys)
    ? runtimeSource.providerKeys
    : DEFAULT_SETTINGS.runtime.providerKeys
  const runConfigSource = isRecord(runtimeSource.runConfig)
    ? runtimeSource.runConfig
    : DEFAULT_SETTINGS.runtime.runConfig

  const normalizedMode = toMode(runtimeSource.defaultMode)

  return {
    provider: {
      preset: toProviderPreset(providerSource.preset),
      baseUrl: stringOr(providerSource.baseUrl, DEFAULT_SETTINGS.provider.baseUrl).trim(),
      apiKey: stringOr(providerSource.apiKey, ''),
      model: stringOr(providerSource.model, DEFAULT_SETTINGS.provider.model).trim(),
      temperature: numberOr(providerSource.temperature, DEFAULT_SETTINGS.provider.temperature),
      maxTokens: integerOr(providerSource.maxTokens, DEFAULT_SETTINGS.provider.maxTokens),
      stream: true,
    },
    runtime: {
      sidecarBaseUrl: stringOr(runtimeSource.sidecarBaseUrl, DEFAULT_SETTINGS.runtime.sidecarBaseUrl).trim(),
      defaultMode: normalizedMode,
      runConfig: {
        maxSteps: integerInRange(runConfigSource.maxSteps, DEFAULT_RUN_CONFIG.maxSteps, 1, 24),
        maxSources: integerInRange(runConfigSource.maxSources, DEFAULT_RUN_CONFIG.maxSources, 1, 16),
        timeBudgetSec: integerInRange(
          runConfigSource.timeBudgetSec,
          DEFAULT_RUN_CONFIG.timeBudgetSec,
          15,
          900,
        ),
        swarmMaxAgents: integerInRange(
          runConfigSource.swarmMaxAgents,
          DEFAULT_RUN_CONFIG.swarmMaxAgents,
          3,
          5,
        ),
        thinkingPasses: integerInRange(
          runConfigSource.thinkingPasses,
          DEFAULT_RUN_CONFIG.thinkingPasses,
          2,
          6,
        ),
      },
      providerKeys: {
        tavilyApiKey: stringOr(providerKeysSource.tavilyApiKey, ''),
        braveApiKey: stringOr(providerKeysSource.braveApiKey, ''),
      },
    },
    uiDensity: source.uiDensity === 'compact' ? 'compact' : 'comfortable',
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function integerOr(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.round(value))
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const rounded = Math.round(value)
  return Math.max(min, Math.min(max, rounded))
}

function toProviderPreset(value: unknown): AppSettings['provider']['preset'] {
  if (value === 'lmstudio' || value === 'ollama' || value === 'vllm' || value === 'custom') {
    return value
  }

  return DEFAULT_SETTINGS.provider.preset
}

function toMode(value: unknown): ModeType {
  if (
    value === 'chat' ||
    value === 'agent' ||
    value === 'deep_think' ||
    value === 'deep_research' ||
    value === 'swarm'
  ) {
    return value
  }

  return DEFAULT_SETTINGS.runtime.defaultMode
}
