import fs from 'node:fs'
import path from 'node:path'

import type { ProviderKeys } from './types'

const ROOT_DIR = path.resolve(__dirname, '..', '..')

export interface RuntimeConfig {
  host: string
  port: number
  databasePath: string
  defaultModelBaseUrl: string
  requestTimeoutMs: number
  providerConfigPath: string
}

export function loadRuntimeConfig(): RuntimeConfig {
  const dataDir = path.join(ROOT_DIR, 'agent-runtime', 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  return {
    host: process.env.AGENT_RUNTIME_HOST ?? '127.0.0.1',
    port: parseNumber(process.env.AGENT_RUNTIME_PORT, 8787),
    databasePath: process.env.AGENT_RUNTIME_DB ?? path.join(dataDir, 'runtime.sqlite'),
    defaultModelBaseUrl: process.env.MODEL_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    requestTimeoutMs: parseNumber(process.env.AGENT_REQUEST_TIMEOUT_MS, 45000),
    providerConfigPath:
      process.env.AGENT_PROVIDER_CONFIG ?? path.join(dataDir, 'provider-keys.json'),
  }
}

export function loadProviderKeys(configPath: string): ProviderKeys {
  const envKeys: ProviderKeys = {
    tavilyApiKey: process.env.TAVILY_API_KEY,
    braveApiKey: process.env.BRAVE_API_KEY,
  }

  if (envKeys.tavilyApiKey || envKeys.braveApiKey) {
    return normalizeProviderKeys(envKeys)
  }

  if (!fs.existsSync(configPath)) {
    return {}
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as ProviderKeys
    return normalizeProviderKeys(parsed)
  } catch {
    return {}
  }
}

export function saveProviderKeys(configPath: string, keys: ProviderKeys): void {
  const normalized = normalizeProviderKeys(keys)
  const parentDir = path.dirname(configPath)
  fs.mkdirSync(parentDir, { recursive: true })

  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), {
    mode: 0o600,
  })
}

function normalizeProviderKeys(keys: ProviderKeys): ProviderKeys {
  return {
    tavilyApiKey: keys.tavilyApiKey?.trim() || undefined,
    braveApiKey: keys.braveApiKey?.trim() || undefined,
  }
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
