import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

import type { WorkspaceCheckpoint } from '@webide/protocol'
import type { WorkspaceRecord } from './types.js'
import { makeId, nowIso } from './utils.js'

export async function createWorkspaceCheckpoint(
  checkpointsDir: string,
  workspace: WorkspaceRecord,
  summary: string,
): Promise<WorkspaceCheckpoint & { archivePath: string }> {
  fs.mkdirSync(checkpointsDir, { recursive: true })

  const checkpointId = makeId('ckpt')
  const createdAt = nowIso()
  const archivePath = path.join(checkpointsDir, `${checkpointId}.tar.gz`)
  const gitRef = await resolveGitRef(workspace.rootPath)

  await createTarArchive(workspace.rootPath, archivePath)

  return {
    id: checkpointId,
    workspaceId: workspace.id,
    createdAt,
    gitRef,
    summary,
    archivePath,
  }
}

export async function restoreWorkspaceCheckpoint(
  workspace: WorkspaceRecord,
  archivePath: string,
): Promise<void> {
  if (!fs.existsSync(archivePath)) {
    throw new Error('Checkpoint archive not found.')
  }

  await extractTarArchive(workspace.rootPath, archivePath)
}

async function createTarArchive(sourceDir: string, archivePath: string): Promise<void> {
  const parentDir = path.dirname(sourceDir)
  const baseName = path.basename(sourceDir)

  await exec('tar', ['-czf', archivePath, '-C', parentDir, baseName])
}

async function extractTarArchive(targetDir: string, archivePath: string): Promise<void> {
  const parentDir = path.dirname(targetDir)
  const baseName = path.basename(targetDir)

  await exec('tar', ['-xzf', archivePath, '-C', parentDir])

  if (!fs.existsSync(path.join(parentDir, baseName))) {
    throw new Error('Checkpoint extraction failed: workspace root missing after restore.')
  }
}

async function resolveGitRef(rootPath: string): Promise<string | null> {
  try {
    const ref = await execCapture('git', ['rev-parse', 'HEAD'], rootPath)
    return ref.trim() || null
  } catch {
    return null
  }
}

async function exec(command: string, args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'ignore',
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 0}`))
    })
  })
}

async function execCapture(command: string, args: string[], cwd?: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(new Error(stderr || `${command} exited with ${code ?? 0}`))
    })
  })
}
