import Database from 'better-sqlite3'

import type {
  BenchmarkReport,
  Citation,
  PersistedRun,
  RunArtifact,
  RunEventName,
  RunTimelineEvent,
} from './types'

export class RuntimeDatabase {
  private readonly database: Database.Database

  public constructor(filename: string) {
    this.database = new Database(filename)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
    this.initialize()
  }

  public close(): void {
    this.database.close()
  }

  public createRun(run: PersistedRun): void {
    const statement = this.database.prepare(
      `
      INSERT INTO runs (
        id, thread_id, mode, prompt, status, created_at, updated_at,
        citations_json, artifact_json, metrics_json, error,
        model_config_json, run_config_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )

    statement.run(
      run.id,
      run.threadId,
      run.mode,
      run.prompt,
      run.status,
      run.createdAt,
      run.updatedAt,
      JSON.stringify(run.citations),
      JSON.stringify(run.artifact),
      JSON.stringify(run.metrics),
      run.error ?? null,
      JSON.stringify(run.modelConfig),
      JSON.stringify(run.runConfig),
    )
  }

  public updateRun(run: PersistedRun): void {
    const statement = this.database.prepare(
      `
      UPDATE runs
      SET status = ?, updated_at = ?, citations_json = ?, artifact_json = ?, metrics_json = ?, error = ?
      WHERE id = ?
      `,
    )

    statement.run(
      run.status,
      run.updatedAt,
      JSON.stringify(run.citations),
      JSON.stringify(run.artifact),
      JSON.stringify(run.metrics),
      run.error ?? null,
      run.id,
    )
  }

  public updateRunStatus(runId: string, status: PersistedRun['status'], error?: string): void {
    const statement = this.database.prepare(
      `
      UPDATE runs
      SET status = ?, updated_at = ?, error = ?
      WHERE id = ?
      `,
    )

    statement.run(status, nowIso(), error ?? null, runId)
  }

  public appendEvent(
    runId: string,
    event: RunEventName,
    payload: Record<string, unknown>,
  ): RunTimelineEvent {
    const now = nowIso()
    const statement = this.database.prepare(
      `
      INSERT INTO run_events (run_id, event_name, payload_json, created_at)
      VALUES (?, ?, ?, ?)
      `,
    )

    const result = statement.run(runId, event, JSON.stringify(payload), now)

    return {
      id: Number(result.lastInsertRowid),
      runId,
      event,
      payload,
      createdAt: now,
    }
  }

  public listRunEvents(runId: string): RunTimelineEvent[] {
    const statement = this.database.prepare(
      `
      SELECT id, run_id, event_name, payload_json, created_at
      FROM run_events
      WHERE run_id = ?
      ORDER BY id ASC
      `,
    )

    const rows = statement.all(runId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: Number(row.id),
      runId: String(row.run_id),
      event: String(row.event_name) as RunEventName,
      payload: parseRecord(row.payload_json),
      createdAt: String(row.created_at),
    }))
  }

  public getRun(runId: string): PersistedRun | null {
    const statement = this.database.prepare(
      `
      SELECT
        id,
        thread_id,
        mode,
        prompt,
        status,
        created_at,
        updated_at,
        citations_json,
        artifact_json,
        metrics_json,
        error,
        model_config_json,
        run_config_json
      FROM runs
      WHERE id = ?
      `,
    )

    const row = statement.get(runId) as Record<string, unknown> | undefined
    return row ? toPersistedRun(row) : null
  }

  public listRuns(limit = 200): PersistedRun[] {
    const statement = this.database.prepare(
      `
      SELECT
        id,
        thread_id,
        mode,
        prompt,
        status,
        created_at,
        updated_at,
        citations_json,
        artifact_json,
        metrics_json,
        error,
        model_config_json,
        run_config_json
      FROM runs
      ORDER BY created_at DESC
      LIMIT ?
      `,
    )

    const rows = statement.all(limit) as Array<Record<string, unknown>>
    return rows.map(toPersistedRun)
  }

  public saveBenchmarkReport(report: BenchmarkReport): void {
    const statement = this.database.prepare(
      `
      INSERT INTO bench_reports (id, created_at, payload_json)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, payload_json = excluded.payload_json
      `,
    )

    statement.run(report.id, report.generatedAt, JSON.stringify(report))
  }

  public getLatestBenchmarkReport(): BenchmarkReport | null {
    const row = this.database
      .prepare(
        `
        SELECT payload_json
        FROM bench_reports
        ORDER BY created_at DESC
        LIMIT 1
        `,
      )
      .get() as { payload_json?: string } | undefined

    if (!row?.payload_json) {
      return null
    }

    try {
      return JSON.parse(row.payload_json) as BenchmarkReport
    } catch {
      return null
    }
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        citations_json TEXT NOT NULL,
        artifact_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        error TEXT,
        model_config_json TEXT NOT NULL,
        run_config_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs(mode);
      CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

      CREATE TABLE IF NOT EXISTS bench_reports (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `)
  }
}

function toPersistedRun(row: Record<string, unknown>): PersistedRun {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    mode: String(row.mode) as PersistedRun['mode'],
    prompt: String(row.prompt),
    status: String(row.status) as PersistedRun['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    citations: parseArray(row.citations_json) as unknown as Citation[],
    artifact: parseRecord(row.artifact_json) as unknown as RunArtifact,
    metrics: parseRecord(row.metrics_json) as Record<string, number>,
    error: typeof row.error === 'string' ? row.error : undefined,
    modelConfig: parseRecord(row.model_config_json) as unknown as PersistedRun['modelConfig'],
    runConfig: parseRecord(row.run_config_json) as unknown as PersistedRun['runConfig'],
  }
}

function parseArray(value: unknown): unknown[] {
  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseRecord(value: unknown): Record<string, unknown> {
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

function nowIso(): string {
  return new Date().toISOString()
}
