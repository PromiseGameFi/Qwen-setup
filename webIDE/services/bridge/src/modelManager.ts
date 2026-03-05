import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import type { ModelStatus } from '@webide/protocol'
import type { BridgeConfig, ModelRuntimeState } from './types.js'
import { nowIso, sha256File } from './utils.js'

export class ModelManager {
  private readonly config: BridgeConfig

  private readonly modelsDir: string

  private readonly modelPath: string

  private readonly runtimeState: ModelRuntimeState = {
    process: null,
    progress: 0,
    serving: false,
  }

  public constructor(config: BridgeConfig) {
    this.config = config
    this.modelsDir = path.join(config.appDataDir, 'models')
    this.modelPath = path.join(this.modelsDir, config.modelFileName)
  }

  public getModelPath(): string {
    return this.modelPath
  }

  public isInstalled(): boolean {
    return fs.existsSync(this.modelPath) && fs.statSync(this.modelPath).size > 0
  }

  public async getStatus(): Promise<ModelStatus> {
    let bytes = 0
    let checksum: string | undefined

    if (this.isInstalled()) {
      const stats = fs.statSync(this.modelPath)
      bytes = stats.size
      if (this.config.modelChecksum || bytes < 2_500_000_000) {
        checksum = await sha256File(this.modelPath).catch(() => undefined)
      }
    }

    const serving = this.runtimeState.process !== null && !this.runtimeState.process.killed
    this.runtimeState.serving = serving

    return {
      installed: this.isInstalled(),
      modelId: this.config.modelId,
      quant: this.config.modelQuant,
      bytes,
      checksum,
      serving,
      endpoint: this.modelEndpoint(),
      progress: this.runtimeState.progress,
      updatedAt: nowIso(),
    }
  }

  public async ensureModel(onProgress?: (progress: number) => void): Promise<ModelStatus> {
    if (this.isInstalled()) {
      this.runtimeState.progress = 1
      return await this.getStatus()
    }

    fs.mkdirSync(this.modelsDir, { recursive: true })

    const tempPath = `${this.modelPath}.part`
    const existing = fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0

    const headers: HeadersInit = {}
    if (existing > 0) {
      headers.Range = `bytes=${existing}-`
    }

    const response = await fetch(this.config.modelDownloadUrl, {
      method: 'GET',
      headers,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Model download failed (${response.status}) from ${this.config.modelDownloadUrl}`)
    }

    const totalRaw = response.headers.get('content-length')
    const total = totalRaw ? Number.parseInt(totalRaw, 10) + existing : undefined

    const writer = fs.createWriteStream(tempPath, {
      flags: existing > 0 ? 'a' : 'w',
    })

    const reader = response.body.getReader()
    let downloaded = existing

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      writer.write(value)
      downloaded += value.byteLength
      if (total && total > 0) {
        this.runtimeState.progress = Math.min(1, downloaded / total)
      } else {
        this.runtimeState.progress = 0.5
      }

      onProgress?.(this.runtimeState.progress)
    }

    writer.end()
    await new Promise<void>((resolve) => writer.on('finish', () => resolve()))

    fs.renameSync(tempPath, this.modelPath)
    this.runtimeState.progress = 1

    const status = await this.getStatus()

    if (this.config.modelChecksum && status.checksum && status.checksum !== this.config.modelChecksum) {
      throw new Error('Model checksum mismatch after download.')
    }

    return status
  }

  public async startModel(): Promise<ModelStatus> {
    if (!this.isInstalled()) {
      throw new Error('Model is not installed. Call /v1/model/ensure first.')
    }

    if (this.runtimeState.process && !this.runtimeState.process.killed) {
      return await this.getStatus()
    }

    const args = [
      '--model',
      this.modelPath,
      '--host',
      this.config.modelApiHost,
      '--port',
      String(this.config.modelApiPort),
      '--ctx-size',
      String(this.config.modelContextSize),
      '--no-webui',
    ]

    if (this.config.modelApiKey) {
      args.push('--api-key', this.config.modelApiKey)
    }

    const child = spawn('llama-server', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    this.runtimeState.process = child
    this.runtimeState.startedAt = nowIso()
    this.runtimeState.serving = false

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    child.stdout?.on('data', (line: string) => {
      process.stdout.write(`[bridge:model] ${line}`)
    })

    child.stderr?.on('data', (line: string) => {
      process.stderr.write(`[bridge:model] ${line}`)
    })

    child.on('exit', (code, signal) => {
      this.runtimeState.process = null
      this.runtimeState.serving = false
      this.runtimeState.lastError = `Model process exited (${signal ?? code ?? 0}).`
    })

    await this.waitForModelHealth(30_000)
    this.runtimeState.serving = true

    return await this.getStatus()
  }

  public async stopModel(): Promise<ModelStatus> {
    if (!this.runtimeState.process) {
      return await this.getStatus()
    }

    const processRef = this.runtimeState.process

    await new Promise<void>((resolve) => {
      processRef.once('exit', () => resolve())
      processRef.kill('SIGTERM')
      setTimeout(() => {
        if (!processRef.killed) {
          processRef.kill('SIGKILL')
        }
      }, 3000)
    })

    this.runtimeState.process = null
    this.runtimeState.serving = false

    return await this.getStatus()
  }

  public modelEndpoint(): string {
    return `http://${this.config.modelApiHost}:${this.config.modelApiPort}/v1`
  }

  public async waitForModelHealth(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    const endpoint = `${this.modelEndpoint()}/models`

    while (Date.now() < deadline) {
      try {
        const response = await fetch(endpoint, { method: 'GET' })
        if (response.ok) {
          return
        }
      } catch {
        // Retry.
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error(`Timed out waiting for model health at ${endpoint}`)
  }
}
