import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

type ManagedService = 'model' | 'sidecar' | 'ui'
type DevAllMode = 'local' | 'hf'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function parseMode(): DevAllMode {
  const cliMode = process.argv.find((argument) => argument.startsWith('--mode='))?.split('=')[1]
  const envMode = process.env.DEV_ALL_MODE
  const resolved = cliMode ?? envMode
  return resolved === 'hf' ? 'hf' : 'local'
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

const mode = parseMode()
const modelBaseUrl = normalizeBaseUrl(
  process.env.MODEL_BASE_URL ?? process.env.VITE_MODEL_BASE_URL ?? 'http://127.0.0.1:1234/v1',
)
const MODEL_HEALTH_URL = `${modelBaseUrl}/models`
const SIDECAR_HEALTH_URL = 'http://127.0.0.1:8787/api/health'
const UI_HEALTH_URL = 'http://127.0.0.1:5173'

const MODEL_HEALTH_TIMEOUT_MS = Number.parseInt(process.env.DEV_ALL_MODEL_TIMEOUT_MS ?? '900000', 10)
const SIDECAR_HEALTH_TIMEOUT_MS = Number.parseInt(process.env.DEV_ALL_SIDECAR_TIMEOUT_MS ?? '60000', 10)
const UI_HEALTH_TIMEOUT_MS = Number.parseInt(process.env.DEV_ALL_UI_TIMEOUT_MS ?? '60000', 10)

const sidecarRestartBackoff = [1000, 2000, 5000, 8000]

const children = new Map<ManagedService, ChildProcess>()
let shuttingDown = false
let sidecarRestartCount = 0
let sidecarRestartTimer: NodeJS.Timeout | null = null

function log(line: string): void {
  process.stdout.write(`[dev-all] ${line}\n`)
}

function logError(line: string): void {
  process.stderr.write(`[dev-all] ${line}\n`)
}

function formatExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) {
    return `signal ${signal}`
  }
  return `code ${code ?? 0}`
}

function wireOutput(service: ManagedService, stream: NodeJS.ReadableStream | null): void {
  if (!stream) {
    return
  }

  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''

    for (const line of lines) {
      process.stdout.write(`[${service}] ${line}\n`)
    }
  })

  stream.on('end', () => {
    if (pending.trim()) {
      process.stdout.write(`[${service}] ${pending}\n`)
      pending = ''
    }
  })
}

function spawnService(service: ManagedService, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })

  children.set(service, child)
  wireOutput(service, child.stdout)
  wireOutput(service, child.stderr)

  child.once('error', (error) => {
    if (shuttingDown) {
      return
    }

    logError(`${service} failed to start: ${error.message}`)
    void shutdown(1)
  })

  return child
}

function startSidecar(): void {
  const child = spawnService('sidecar', npmCommand, ['run', 'dev:sidecar'])

  child.once('exit', (code, signal) => {
    children.delete('sidecar')

    if (shuttingDown) {
      return
    }

    const delayMs = sidecarRestartBackoff[Math.min(sidecarRestartCount, sidecarRestartBackoff.length - 1)]
    sidecarRestartCount += 1

    logError(`sidecar exited (${formatExit(code, signal)}), restarting in ${delayMs}ms`)
    sidecarRestartTimer = setTimeout(() => {
      sidecarRestartTimer = null
      if (shuttingDown) {
        return
      }

      startSidecar()
      void waitForHealth({
        name: 'sidecar',
        url: SIDECAR_HEALTH_URL,
        timeoutMs: SIDECAR_HEALTH_TIMEOUT_MS,
        onAbort: () => !children.has('sidecar'),
      })
        .then(() => {
          sidecarRestartCount = 0
          log('sidecar recovered and is healthy again')
        })
        .catch((error) => {
          logError(`sidecar restart health check failed: ${(error as Error).message}`)
        })
    }, delayMs)
  })
}

function watchFatalExit(service: ManagedService, label: string, child: ChildProcess): void {
  child.once('exit', (code, signal) => {
    children.delete(service)

    if (shuttingDown) {
      return
    }

    logError(`${label} exited (${formatExit(code, signal)}). Stopping all services.`)
    void shutdown(1)
  })
}

async function waitForHealth({
  name,
  url,
  timeoutMs,
  onAbort,
}: {
  name: string
  url: string
  timeoutMs: number
  onAbort?: () => boolean
}): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (onAbort?.()) {
      throw new Error(`${name} process exited before health check succeeded`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 2500)

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.ok) {
        return
      }
    } catch {
      // Retry until timeout.
    } finally {
      clearTimeout(timeoutId)
    }

    await delay(1000)
  }

  throw new Error(`timed out waiting for ${name} at ${url}`)
}

async function terminateChild(service: ManagedService): Promise<void> {
  const child = children.get(service)
  if (!child) {
    return
  }

  children.delete(service)
  if (child.exitCode !== null || child.killed) {
    return
  }

  const pid = child.pid
  if (!pid) {
    return
  }

  const terminate = (signal: NodeJS.Signals): void => {
    try {
      if (process.platform !== 'win32') {
        process.kill(-pid, signal)
        return
      }
    } catch {
      // Fall through to direct kill.
    }

    try {
      child.kill(signal)
    } catch {
      // Ignore.
    }
  }

  const waitForExit = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })

  terminate('SIGTERM')
  await Promise.race([waitForExit, delay(4000)])

  if (child.exitCode === null) {
    terminate('SIGKILL')
    await Promise.race([waitForExit, delay(1500)])
  }
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  if (sidecarRestartTimer) {
    clearTimeout(sidecarRestartTimer)
    sidecarRestartTimer = null
  }

  log('shutting down services...')
  await Promise.all([terminateChild('ui'), terminateChild('sidecar'), terminateChild('model')])
  process.exit(exitCode)
}

async function main(): Promise<void> {
  if (mode === 'local') {
    log('starting local model server...')
    const model = spawnService('model', path.join(rootDir, 'scripts', 'start_qwen_mlx_server.sh'), [])
    watchFatalExit('model', 'model server', model)
    await waitForHealth({
      name: 'model server',
      url: MODEL_HEALTH_URL,
      timeoutMs: MODEL_HEALTH_TIMEOUT_MS,
      onAbort: () => !children.has('model'),
    })
    log(`model is healthy at ${MODEL_HEALTH_URL}`)
  } else {
    log(`mode=hf: skipping local model startup. Expecting remote model at ${modelBaseUrl}`)
    try {
      await waitForHealth({
        name: 'remote model endpoint',
        url: MODEL_HEALTH_URL,
        timeoutMs: Math.min(MODEL_HEALTH_TIMEOUT_MS, 45000),
      })
      log(`remote model endpoint is reachable at ${MODEL_HEALTH_URL}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'remote model probe failed'
      logError(`remote model endpoint is not reachable yet (${message})`)
      logError('UI and sidecar will still start; update model URL/settings and retry when ready.')
    }
  }

  log('starting sidecar...')
  startSidecar()
  await waitForHealth({
    name: 'sidecar',
    url: SIDECAR_HEALTH_URL,
    timeoutMs: SIDECAR_HEALTH_TIMEOUT_MS,
    onAbort: () => !children.has('sidecar'),
  })
  sidecarRestartCount = 0
  log(`sidecar is healthy at ${SIDECAR_HEALTH_URL}`)

  log('starting UI...')
  const ui = spawnService('ui', npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'])
  watchFatalExit('ui', 'UI dev server', ui)
  await waitForHealth({
    name: 'UI',
    url: UI_HEALTH_URL,
    timeoutMs: UI_HEALTH_TIMEOUT_MS,
    onAbort: () => !children.has('ui'),
  })

  log(`UI is healthy at ${UI_HEALTH_URL}`)
  if (mode === 'local') {
    log('all services are running (mode=local, model:1234, sidecar:8787, ui:5173)')
  } else {
    log(`all services are running (mode=hf, remote model:${modelBaseUrl}, sidecar:8787, ui:5173)`)
  }
}

process.on('SIGINT', () => {
  void shutdown(0)
})

process.on('SIGTERM', () => {
  void shutdown(0)
})

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown startup failure'
  logError(message)
  void shutdown(1)
})
