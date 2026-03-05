import path from 'node:path'
import fs from 'node:fs'

import Database from 'better-sqlite3'

import type { AgentRunEvent, WorkspaceCheckpoint } from '@webide/protocol'
import type { AgentRunRecord, WorkspaceRecord } from './types.js'

export class BridgeStore {
  private readonly db: Database.Database

  public constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    const dbPath = path.join(dataDir, 'bridge.sqlite')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
  }

  public close(): void {
    this.db.close()
  }

  public upsertWorkspace(workspace: WorkspaceRecord): void {
    this.db
      .prepare(
        `
      INSERT INTO workspaces (id, root_path, label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET root_path = excluded.root_path, label = excluded.label, updated_at = excluded.updated_at
      `,
      )
      .run(workspace.id, workspace.rootPath, workspace.label, workspace.createdAt, workspace.updatedAt)
  }

  public listWorkspaces(): WorkspaceRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, root_path, label, created_at, updated_at
      FROM workspaces
      ORDER BY updated_at DESC
      `,
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: String(row.id),
      rootPath: String(row.root_path),
      label: String(row.label),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }))
  }

  public getWorkspace(workspaceId: string): WorkspaceRecord | null {
    const row = this.db
      .prepare(
        `
      SELECT id, root_path, label, created_at, updated_at
      FROM workspaces
      WHERE id = ?
      `,
      )
      .get(workspaceId) as Record<string, unknown> | undefined

    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      rootPath: String(row.root_path),
      label: String(row.label),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }

  public createCheckpoint(checkpoint: WorkspaceCheckpoint & { archivePath: string }): void {
    this.db
      .prepare(
        `
      INSERT INTO checkpoints (id, workspace_id, created_at, git_ref, summary, archive_path)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        checkpoint.id,
        checkpoint.workspaceId,
        checkpoint.createdAt,
        checkpoint.gitRef,
        checkpoint.summary,
        checkpoint.archivePath,
      )
  }

  public getCheckpoint(checkpointId: string): (WorkspaceCheckpoint & { archivePath: string }) | null {
    const row = this.db
      .prepare(
        `
      SELECT id, workspace_id, created_at, git_ref, summary, archive_path
      FROM checkpoints
      WHERE id = ?
      `,
      )
      .get(checkpointId) as Record<string, unknown> | undefined

    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      createdAt: String(row.created_at),
      gitRef: typeof row.git_ref === 'string' ? row.git_ref : null,
      summary: String(row.summary),
      archivePath: String(row.archive_path),
    }
  }

  public listCheckpoints(workspaceId: string): WorkspaceCheckpoint[] {
    const rows = this.db
      .prepare(
        `
      SELECT id, workspace_id, created_at, git_ref, summary
      FROM checkpoints
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      `,
      )
      .all(workspaceId) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      createdAt: String(row.created_at),
      gitRef: typeof row.git_ref === 'string' ? row.git_ref : null,
      summary: String(row.summary),
    }))
  }

  public createRun(run: AgentRunRecord): void {
    this.db
      .prepare(
        `
      INSERT INTO agent_runs (id, workspace_id, goal, mode, status, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(run.id, run.workspaceId, run.goal, run.mode, run.status, run.createdAt, run.updatedAt, run.error ?? null)
  }

  public updateRun(run: AgentRunRecord): void {
    this.db
      .prepare(
        `
      UPDATE agent_runs
      SET status = ?, updated_at = ?, error = ?
      WHERE id = ?
      `,
      )
      .run(run.status, run.updatedAt, run.error ?? null, run.id)
  }

  public getRun(runId: string): AgentRunRecord | null {
    const row = this.db
      .prepare(
        `
      SELECT id, workspace_id, goal, mode, status, created_at, updated_at, error
      FROM agent_runs
      WHERE id = ?
      `,
      )
      .get(runId) as Record<string, unknown> | undefined

    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      goal: String(row.goal),
      mode: String(row.mode),
      status: row.status as AgentRunRecord['status'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      error: typeof row.error === 'string' ? row.error : undefined,
    }
  }

  public appendRunEvent(event: AgentRunEvent): AgentRunEvent {
    const result = this.db
      .prepare(
        `
      INSERT INTO agent_run_events (run_id, ts, kind, payload_json)
      VALUES (?, ?, ?, ?)
      `,
      )
      .run(event.runId, event.ts, event.kind, JSON.stringify(event.payload))

    return {
      ...event,
      id: Number(result.lastInsertRowid),
    }
  }

  public listRunEvents(runId: string, afterId?: number): AgentRunEvent[] {
    const useAfter = Number.isFinite(afterId)
    const statement = this.db.prepare(
      useAfter
        ? `
        SELECT id, run_id, ts, kind, payload_json
        FROM agent_run_events
        WHERE run_id = ? AND id > ?
        ORDER BY id ASC
      `
        : `
        SELECT id, run_id, ts, kind, payload_json
        FROM agent_run_events
        WHERE run_id = ?
        ORDER BY id ASC
      `,
    )

    const rows = useAfter
      ? (statement.all(runId, Math.round(afterId as number)) as Array<Record<string, unknown>>)
      : (statement.all(runId) as Array<Record<string, unknown>>)

    return rows.map((row) => ({
      id: Number(row.id),
      runId: String(row.run_id),
      ts: String(row.ts),
      kind: row.kind as AgentRunEvent['kind'],
      payload: parsePayload(row.payload_json),
    }))
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        git_ref TEXT,
        summary TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error TEXT,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_run_id ON agent_run_events(run_id, id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_workspace_id ON checkpoints(workspace_id, created_at DESC);
    `)
  }
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
