import type { ChildProcess } from 'node:child_process'

export interface BridgeConfig {
  host: string
  port: number
  version: string
  appDataDir: string
  modelId: string
  modelQuant: string
  modelFileName: string
  modelDownloadUrl: string
  modelChecksum?: string
  modelApiHost: string
  modelApiPort: number
  modelApiKey?: string
  modelContextSize: number
  maxConcurrentCommands: number
  commandTimeoutMs: number
  commandMemoryMb: number
  commandCpuSeconds: number
  pairingTokenTtlMs: number
  allowedOrigins: string[]
  networkAllowlist: string[]
}

export interface PairingToken {
  token: string
  origin: string
  expiresAt: number
}

export interface WorkspaceRecord {
  id: string
  rootPath: string
  label: string
  createdAt: string
  updatedAt: string
}

export interface ModelRuntimeState {
  process: ChildProcess | null
  startedAt?: string
  lastError?: string
  progress: number
  serving: boolean
}

export interface CommandExecutionResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
}

export interface AgentRunRecord {
  id: string
  workspaceId: string
  goal: string
  mode: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
  error?: string
}
