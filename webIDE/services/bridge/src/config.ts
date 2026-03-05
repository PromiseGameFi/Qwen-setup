import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { BridgeConfig } from './types.js'

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function stringEnv(name: string, fallback: string): string {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const trimmed = raw.trim()
  return trimmed || fallback
}

export function loadBridgeConfig(): BridgeConfig {
  const appDataDir = path.join(os.homedir(), '.webide')
  fs.mkdirSync(appDataDir, { recursive: true })
  fs.mkdirSync(path.join(appDataDir, 'models'), { recursive: true })
  fs.mkdirSync(path.join(appDataDir, 'checkpoints'), { recursive: true })
  fs.mkdirSync(path.join(appDataDir, 'logs'), { recursive: true })

  const modelId = stringEnv('WEBIDE_MODEL_ID', 'Qwen3.5-9B')
  const modelQuant = stringEnv('WEBIDE_MODEL_QUANT', 'Q4_K_M')
  const modelFileName = stringEnv('WEBIDE_MODEL_FILE', 'qwen3.5-9b-q4_k_m.gguf')

  // Default is intentionally configurable. Verify and update if you host your own mirror.
  const modelDownloadUrl = stringEnv(
    'WEBIDE_MODEL_URL',
    'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
  )

  return {
    host: stringEnv('WEBIDE_BRIDGE_HOST', '127.0.0.1'),
    port: intEnv('WEBIDE_BRIDGE_PORT', 4317),
    version: stringEnv('WEBIDE_BRIDGE_VERSION', '0.1.0'),
    appDataDir,
    modelId,
    modelQuant,
    modelFileName,
    modelDownloadUrl,
    modelChecksum: process.env.WEBIDE_MODEL_SHA256?.trim() || undefined,
    modelApiHost: stringEnv('WEBIDE_MODEL_API_HOST', '127.0.0.1'),
    modelApiPort: intEnv('WEBIDE_MODEL_API_PORT', 8012),
    modelApiKey: process.env.WEBIDE_MODEL_API_KEY?.trim() || undefined,
    modelContextSize: intEnv('WEBIDE_MODEL_CTX', 8192),
    maxConcurrentCommands: intEnv('WEBIDE_MAX_CONCURRENT_COMMANDS', 2),
    commandTimeoutMs: intEnv('WEBIDE_COMMAND_TIMEOUT_MS', 120000),
    commandMemoryMb: intEnv('WEBIDE_COMMAND_MEMORY_MB', 1024),
    commandCpuSeconds: intEnv('WEBIDE_COMMAND_CPU_SECONDS', 120),
    pairingTokenTtlMs: intEnv('WEBIDE_PAIRING_TTL_MS', 10 * 60 * 1000),
    allowedOrigins: (process.env.WEBIDE_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5174,http://localhost:5174')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    networkAllowlist: (process.env.WEBIDE_NETWORK_ALLOWLIST ??
      'registry.npmjs.org,pypi.org,files.pythonhosted.org,github.com,raw.githubusercontent.com')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  }
}
