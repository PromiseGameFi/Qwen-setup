import process from 'node:process'

interface EndpointCheck {
  name: string
  url: string
}

type DevAllMode = 'local' | 'hf'

function parseMode(): DevAllMode {
  const cliMode = process.argv.find((argument) => argument.startsWith('--mode='))?.split('=')[1]
  const envMode = process.env.DEV_ALL_MODE
  const resolved = cliMode ?? envMode
  return resolved === 'hf' ? 'hf' : 'local'
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function buildChecks(mode: DevAllMode): EndpointCheck[] {
  const modelBaseUrl = normalizeBaseUrl(
    process.env.MODEL_BASE_URL ?? process.env.VITE_MODEL_BASE_URL ?? 'http://127.0.0.1:1234/v1',
  )

  return [
    {
      name: mode === 'hf' ? 'Remote Model' : 'Local Model',
      url: `${modelBaseUrl}/models`,
    },
    { name: 'Sidecar', url: 'http://127.0.0.1:8787/api/health' },
    { name: 'UI', url: 'http://127.0.0.1:5173' },
  ]
}

async function ping(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
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

    return {
      ok: response.ok,
      status: response.status,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown network error',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function main(): Promise<void> {
  const mode = parseMode()
  const checks = buildChecks(mode)
  let allHealthy = true

  for (const check of checks) {
    const result = await ping(check.url)

    if (result.ok) {
      process.stdout.write(`[health] ${check.name}: online (${result.status}) - ${check.url}\n`)
      continue
    }

    allHealthy = false
    if (result.status !== undefined) {
      process.stdout.write(
        `[health] ${check.name}: unhealthy (${result.status}) - ${check.url}\n`,
      )
    } else {
      process.stdout.write(
        `[health] ${check.name}: offline (${result.error ?? 'request failed'}) - ${check.url}\n`,
      )
    }
  }

  if (!allHealthy) {
    const startCommand = mode === 'hf' ? 'npm run dev:all:hf' : 'npm run dev:all'
    process.stdout.write(
      `[health] one or more services are unavailable. Start everything with: ${startCommand}\n`,
    )
    process.exit(1)
  }

  process.stdout.write('[health] all services are reachable\n')
}

void main()
