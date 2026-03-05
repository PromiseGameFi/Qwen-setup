import crypto from 'node:crypto'
import fs from 'node:fs'

export function nowIso(): string {
  return new Date().toISOString()
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)

    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function sanitizeEnv(input?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const source = input ?? process.env
  const allowlist = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'USER', 'USERNAME', 'SHELL', 'TERM', 'LANG']

  const next: NodeJS.ProcessEnv = {}
  for (const key of allowlist) {
    const value = source[key]
    if (value) {
      next[key] = value
    }
  }

  next.FORCE_COLOR = '0'
  return next
}
