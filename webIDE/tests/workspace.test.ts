import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveWorkspaceFilePath } from '../services/bridge/src/workspace'

const workspace = {
  id: 'ws-1',
  rootPath: '',
  label: 'tmp',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('resolveWorkspaceFilePath', () => {
  it('keeps writes inside workspace root', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'webide-workspace-'))
    workspace.rootPath = temp

    const safe = resolveWorkspaceFilePath(workspace, 'src/index.ts')
    expect(safe.startsWith(temp)).toBe(true)

    expect(() => resolveWorkspaceFilePath(workspace, '../etc/passwd')).toThrow(/escapes workspace root/i)
  })
})
