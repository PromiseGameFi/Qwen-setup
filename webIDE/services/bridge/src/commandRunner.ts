import { spawn } from 'node:child_process'

import type { WorkspaceRecord, CommandExecutionResult } from './types.js'
import { sanitizeEnv } from './utils.js'

export async function executeGuardedCommand(options: {
  workspace: WorkspaceRecord
  command: string
  timeoutMs: number
}): Promise<CommandExecutionResult> {
  const { workspace, command, timeoutMs } = options
  const started = performance.now()

  return await new Promise<CommandExecutionResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd: workspace.rootPath,
      shell: true,
      env: sanitizeEnv(process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let completed = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    const timer = setTimeout(() => {
      if (completed) {
        return
      }
      child.kill('SIGKILL')
    }, timeoutMs)

    child.once('error', (error) => {
      if (completed) {
        return
      }
      completed = true
      clearTimeout(timer)
      reject(error)
    })

    child.once('exit', (code, signal) => {
      if (completed) {
        return
      }
      completed = true
      clearTimeout(timer)

      resolve({
        exitCode: code,
        signal,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - started),
      })
    })
  })
}
