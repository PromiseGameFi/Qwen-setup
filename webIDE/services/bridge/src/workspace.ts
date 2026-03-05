import fs from 'node:fs'
import path from 'node:path'

import type { WorkspaceTreeNode } from '@webide/protocol'
import type { WorkspaceRecord } from './types.js'

const MAX_TREE_DEPTH = 5
const MAX_CHILDREN = 500

const DEFAULT_IGNORE = new Set([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'coverage',
])

export function normalizeWorkspacePath(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  const stats = fs.statSync(resolved)
  if (!stats.isDirectory()) {
    throw new Error('Workspace root path must be a directory.')
  }
  return resolved
}

export function resolveWorkspaceFilePath(workspace: WorkspaceRecord, relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, '')
  const absolute = path.resolve(workspace.rootPath, cleaned)

  if (absolute !== workspace.rootPath && !absolute.startsWith(`${workspace.rootPath}${path.sep}`)) {
    throw new Error('Path escapes workspace root and is blocked.')
  }

  return absolute
}

export function buildWorkspaceTree(rootPath: string): WorkspaceTreeNode {
  return walkDir(rootPath, rootPath, 0)
}

function walkDir(rootPath: string, currentPath: string, depth: number): WorkspaceTreeNode {
  const name = depth === 0 ? path.basename(rootPath) || rootPath : path.basename(currentPath)

  if (depth > MAX_TREE_DEPTH) {
    return {
      name,
      path: path.relative(rootPath, currentPath) || '.',
      type: 'directory',
      children: [],
    }
  }

  const entries = fs.readdirSync(currentPath, { withFileTypes: true })
  const children: WorkspaceTreeNode[] = []

  for (const entry of entries.slice(0, MAX_CHILDREN)) {
    if (DEFAULT_IGNORE.has(entry.name)) {
      continue
    }

    const fullPath = path.join(currentPath, entry.name)
    const relative = path.relative(rootPath, fullPath)

    if (entry.isDirectory()) {
      children.push(walkDir(rootPath, fullPath, depth + 1))
      continue
    }

    if (entry.isFile()) {
      const stats = fs.statSync(fullPath)
      children.push({
        name: entry.name,
        path: relative,
        type: 'file',
        size: stats.size,
      })
    }
  }

  return {
    name,
    path: path.relative(rootPath, currentPath) || '.',
    type: 'directory',
    children: children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    }),
  }
}
