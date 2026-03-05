import fs from 'node:fs'
import path from 'node:path'

import type { AgentRunRequest, AgentRunEvent, WorkspaceCheckpoint } from '@webide/protocol'
import { retrieveKnowledge, type KnowledgeManifest } from '@webide/knowledge-pack'

import { evaluateCommandPolicy, evaluateNetworkAllowlist } from './commandPolicy.js'
import { executeGuardedCommand } from './commandRunner.js'
import { createWorkspaceCheckpoint } from './checkpoints.js'
import type { BridgeStore } from './store.js'
import type { AgentRunRecord, WorkspaceRecord } from './types.js'
import { makeId, nowIso } from './utils.js'
import { resolveWorkspaceFilePath } from './workspace.js'

interface StartAgentRunOptions {
  request: AgentRunRequest
  workspace: WorkspaceRecord
  checkpointsDir: string
  store: BridgeStore
  knowledgeManifest: KnowledgeManifest
  onEvent: (event: AgentRunEvent) => void
  modelEndpoint: string
  modelApiKey?: string
  networkAllowlist: string[]
}

export class AgentRunner {
  private readonly activeControllers = new Map<string, AbortController>()

  public cancel(runId: string): boolean {
    const controller = this.activeControllers.get(runId)
    if (!controller) {
      return false
    }

    controller.abort()
    return true
  }

  public async start(options: StartAgentRunOptions): Promise<AgentRunRecord> {
    const runId = makeId('run')
    const now = nowIso()

    const run: AgentRunRecord = {
      id: runId,
      workspaceId: options.workspace.id,
      goal: options.request.goal,
      mode: options.request.mode,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }

    options.store.createRun(run)

    const controller = new AbortController()
    this.activeControllers.set(runId, controller)

    void this.execute({
      ...options,
      run,
      signal: controller.signal,
    }).finally(() => {
      this.activeControllers.delete(runId)
    })

    return run
  }

  private async execute(
    options: StartAgentRunOptions & {
      run: AgentRunRecord
      signal: AbortSignal
    },
  ): Promise<void> {
    const { run, workspace, request, store, onEvent, signal, checkpointsDir, knowledgeManifest } = options

    const emit = (kind: AgentRunEvent['kind'], payload: Record<string, unknown>): void => {
      const persisted = store.appendRunEvent({
        id: 0,
        runId: run.id,
        ts: nowIso(),
        kind,
        payload,
      })
      onEvent(persisted)
    }

    run.status = 'running'
    run.updatedAt = nowIso()
    store.updateRun(run)

    emit('run.started', {
      goal: run.goal,
      mode: run.mode,
      autonomyLevel: request.autonomyLevel,
    })

    let checkpoint: WorkspaceCheckpoint & { archivePath: string }

    try {
      checkpoint = await createWorkspaceCheckpoint(checkpointsDir, workspace, `Auto checkpoint before run ${run.id}`)
      store.createCheckpoint(checkpoint)
      emit('plan.step', {
        step: 'Created pre-run checkpoint for reversible edits.',
        checkpointId: checkpoint.id,
      })

      const retrievalHits = retrieveKnowledge(request.goal, knowledgeManifest, 4)
      if (retrievalHits.length > 0) {
        for (const hit of retrievalHits) {
          emit('retrieval.hit', {
            chunkId: hit.chunkId,
            title: hit.title,
            score: hit.score,
            citation: hit.citation,
          })

          emit('citation.added', {
            source: hit.citation,
            title: hit.title,
          })
        }
      }

      emit('plan.step', {
        step: 'Generated patch-first plan and prepared guarded command execution.',
      })

      const patch = await this.requestPatchPlan(options.modelEndpoint, options.modelApiKey, workspace, request.goal, retrievalHits)

      emit('patch.preview', {
        summary: patch.summary,
        fileCount: patch.files.length,
        commandCount: patch.commands.length,
      })

      for (const file of patch.files) {
        if (signal.aborted) {
          throw new DOMException('Run cancelled', 'AbortError')
        }

        const targetPath = resolveWorkspaceFilePath(workspace, file.path)
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })

        const before = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : ''
        fs.writeFileSync(targetPath, file.content, 'utf8')

        emit('file.write', {
          path: file.path,
          bytes: Buffer.byteLength(file.content, 'utf8'),
          beforeBytes: Buffer.byteLength(before, 'utf8'),
        })
      }

      for (const command of patch.commands) {
        if (signal.aborted) {
          throw new DOMException('Run cancelled', 'AbortError')
        }

        const networkPolicy = evaluateNetworkAllowlist(command, options.networkAllowlist)
        const policy = networkPolicy ?? evaluateCommandPolicy(command)
        emit('policy.decision', {
          command,
          decision: policy.action,
          reason: policy.reason,
          ruleId: policy.ruleId,
        })

        if (policy.action === 'deny') {
          continue
        }

        emit('command.start', {
          command,
        })

        const result = await executeGuardedCommand({
          workspace,
          command,
          timeoutMs: 120000,
        })

        if (result.stdout.trim()) {
          emit('command.output', {
            command,
            stream: 'stdout',
            text: result.stdout.slice(-6000),
          })
        }

        if (result.stderr.trim()) {
          emit('command.output', {
            command,
            stream: 'stderr',
            text: result.stderr.slice(-6000),
          })
        }

        emit('command.finish', {
          command,
          exitCode: result.exitCode,
          signal: result.signal,
          durationMs: result.durationMs,
        })
      }

      run.status = 'completed'
      run.updatedAt = nowIso()
      store.updateRun(run)

      emit('run.completed', {
        runId: run.id,
        checkpointId: checkpoint.id,
        summary: patch.summary,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        run.status = 'cancelled'
        run.updatedAt = nowIso()
        run.error = 'Run cancelled by user.'
        store.updateRun(run)

        emit('run.cancelled', {
          runId: run.id,
          message: 'Run cancelled by user.',
        })
        return
      }

      run.status = 'failed'
      run.updatedAt = nowIso()
      run.error = error instanceof Error ? error.message : 'Unknown agent run failure.'
      store.updateRun(run)

      emit('run.failed', {
        runId: run.id,
        message: run.error,
      })
    }
  }

  private async requestPatchPlan(
    modelEndpoint: string,
    modelApiKey: string | undefined,
    workspace: WorkspaceRecord,
    goal: string,
    retrievalHits: Array<{ title: string; text: string; citation: string }>,
  ): Promise<{
    summary: string
    files: Array<{ path: string; content: string }>
    commands: string[]
  }> {
    const evidence = retrievalHits
      .map((hit, index) => `S${index + 1} ${hit.title}: ${hit.text} (${hit.citation})`)
      .join('\n')

    const prompt = [
      `Workspace: ${workspace.rootPath}`,
      `Goal: ${goal}`,
      '',
      'Return strict JSON: {"summary": string, "files": [{"path": string, "content": string}], "commands": string[]}',
      'Prefer minimal patch edits and include 0-2 safe commands like lint/test.',
      'If uncertain, create one markdown plan file with next steps.',
      '',
      'Evidence:',
      evidence || 'No retrieval evidence available.',
    ].join('\n')

    try {
      const headers: HeadersInit = {
        'content-type': 'application/json',
      }

      if (modelApiKey) {
        headers.authorization = `Bearer ${modelApiKey}`
      }

      const response = await fetch(`${modelEndpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'Qwen3.5-9B',
          temperature: 0.2,
          max_tokens: 1200,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                'You are a coding agent. Return only valid JSON with a patch-first plan. Never include markdown fences.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Model endpoint returned ${response.status}`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }

      const content = payload.choices?.[0]?.message?.content ?? ''
      const parsed = safeParseJson(content)
      if (parsed) {
        return parsed
      }
    } catch {
      // Fall through to deterministic fallback.
    }

    return {
      summary: 'Created default planning artifact because model output was unavailable or invalid.',
      files: [
        {
          path: 'WEBIDE_AGENT_PLAN.md',
          content: [
            '# Agent Plan',
            '',
            `Goal: ${goal}`,
            '',
            '1. Inspect project structure.',
            '2. Apply minimal focused edits.',
            '3. Run lint/tests and summarize outcomes.',
          ].join('\n'),
        },
      ],
      commands: ['echo "Agent fallback: model unavailable, created plan file."'],
    }
  }
}

function safeParseJson(raw: string): {
  summary: string
  files: Array<{ path: string; content: string }>
  commands: string[]
} | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const record = parsed as {
      summary?: unknown
      files?: unknown
      commands?: unknown
    }

    const files = Array.isArray(record.files)
      ? record.files
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null
            }
            const objectEntry = entry as { path?: unknown; content?: unknown }
            if (typeof objectEntry.path !== 'string' || typeof objectEntry.content !== 'string') {
              return null
            }

            return {
              path: objectEntry.path,
              content: objectEntry.content,
            }
          })
          .filter((entry): entry is { path: string; content: string } => Boolean(entry))
      : []

    const commands = Array.isArray(record.commands)
      ? record.commands.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : []

    return {
      summary:
        typeof record.summary === 'string' && record.summary.trim().length > 0
          ? record.summary.trim()
          : 'Applied patch plan.',
      files,
      commands,
    }
  } catch {
    return null
  }
}
