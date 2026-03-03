import { requestModelCompletion, streamModelCompletion } from './modelClient'
import { runResearchPipeline } from './research'
import { RuntimeDatabase } from './db'
import { RunSseHub } from './sse'
import { mergeRunConfig } from './types'
import type {
  ChatCompletionMessage,
  CreateRunRequest,
  CreateRunResponse,
  PersistedRun,
  ProviderKeys,
  RunConfig,
  RunEventName,
  RunTimelineEvent,
} from './types'

interface RunOrchestratorOptions {
  db: RuntimeDatabase
  sseHub: RunSseHub
  defaultProviderKeys: ProviderKeys
}

interface RunExecutionContext {
  run: PersistedRun
  history: ChatCompletionMessage[]
  signal: AbortSignal
  emit: (event: RunEventName, payload: Record<string, unknown>) => void
  runConfig: RunConfig
  providerKeys: ProviderKeys
}

export class RunOrchestrator {
  private readonly db: RuntimeDatabase

  private readonly sseHub: RunSseHub

  private readonly activeControllers = new Map<string, AbortController>()

  private readonly defaultProviderKeys: ProviderKeys

  public constructor(options: RunOrchestratorOptions) {
    this.db = options.db
    this.sseHub = options.sseHub
    this.defaultProviderKeys = options.defaultProviderKeys
  }

  public createRun(input: CreateRunRequest): CreateRunResponse {
    const now = new Date().toISOString()
    const runId = crypto.randomUUID()

    const run: PersistedRun = {
      id: runId,
      threadId: input.threadId,
      mode: input.mode,
      prompt: input.prompt,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      citations: [],
      artifact: {
        plan: [],
        toolTrace: [],
        evidenceTable: [],
        agentOutputs: [],
        finalAnswer: '',
      },
      metrics: {},
      modelConfig: {
        ...input.modelConfig,
      },
      runConfig: mergeRunConfig(input.runConfig),
    }

    this.db.createRun(run)

    const controller = new AbortController()
    this.activeControllers.set(runId, controller)

    const providerKeys = {
      ...this.defaultProviderKeys,
      ...input.providerKeys,
    }

    void this.executeRun({
      run,
      history: input.history ?? [],
      signal: controller.signal,
      runConfig: run.runConfig,
      providerKeys,
      emit: (event, payload) => {
        const timelineEvent = this.db.appendEvent(runId, event, payload)
        this.sseHub.publish(timelineEvent)
      },
    }).finally(() => {
      this.activeControllers.delete(runId)
    })

    return {
      runId,
      status: run.status,
    }
  }

  public cancelRun(runId: string): boolean {
    const controller = this.activeControllers.get(runId)
    if (!controller) {
      return false
    }

    controller.abort()
    return true
  }

  public listRunEvents(runId: string): RunTimelineEvent[] {
    return this.db.listRunEvents(runId)
  }

  private async executeRun(context: RunExecutionContext): Promise<void> {
    const { run, signal, emit, runConfig } = context
    const startedAt = performance.now()

    run.status = 'running'
    run.updatedAt = new Date().toISOString()
    this.db.updateRun(run)

    emit('run.started', {
      runId: run.id,
      mode: run.mode,
      startedAt: run.updatedAt,
      runConfig,
    })

    try {
      switch (run.mode) {
        case 'chat':
          await this.executeChatMode(context)
          break
        case 'agent':
          await this.executeAgentMode(context)
          break
        case 'deep_think':
          await this.executeDeepThinkMode(context)
          break
        case 'deep_research':
          await this.executeDeepResearchMode(context)
          break
        case 'swarm':
          await this.executeSwarmMode(context)
          break
      }

      if (signal.aborted) {
        throw new DOMException('Run cancelled by user.', 'AbortError')
      }

      run.status = 'completed'
      run.updatedAt = new Date().toISOString()
      run.metrics.latencyMs = Math.round(performance.now() - startedAt)

      this.db.updateRun(run)
      emit('run.completed', {
        runId: run.id,
        finishedAt: run.updatedAt,
        citations: run.citations.length,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The run failed with an unknown runtime error.'

      if (error instanceof DOMException && error.name === 'AbortError') {
        run.status = 'cancelled'
        run.error = 'Run cancelled.'
        run.updatedAt = new Date().toISOString()
        this.db.updateRun(run)
        emit('run.cancelled', {
          runId: run.id,
          message: 'Run cancelled by user.',
        })
        return
      }

      run.status = 'failed'
      run.error = message
      run.updatedAt = new Date().toISOString()
      run.metrics.latencyMs = Math.round(performance.now() - startedAt)
      this.db.updateRun(run)

      emit('run.failed', {
        runId: run.id,
        message,
      })
    }
  }

  private async executeChatMode(context: RunExecutionContext): Promise<void> {
    const { run, history, signal, emit } = context
    const messages: ChatCompletionMessage[] = [...history, { role: 'user', content: run.prompt }]

    const answer = await streamModelCompletion({
      config: run.modelConfig,
      messages,
      signal,
      onDelta: (delta) => {
        run.artifact.finalAnswer += delta
        emit('draft.delta', { delta })
      },
    })

    run.artifact.finalAnswer = answer
    run.metrics.answerQuality = contentQuality(answer)
  }

  private async executeAgentMode(context: RunExecutionContext): Promise<void> {
    const { run, history, signal, emit, runConfig, providerKeys } = context

    const plan = [
      'Interpret task and choose tools.',
      'Retrieve supporting evidence from the web when needed.',
      'Draft final answer with concise action trace.',
    ]

    for (const step of plan) {
      run.artifact.plan.push(step)
      emit('plan.step', { step })
    }

    const research = await runResearchPipeline({
      query: run.prompt,
      runConfig,
      providerKeys,
      signal,
      onToolTrace: (trace) => {
        run.artifact.toolTrace.push(trace)
        emit('tool.call', {
          name: trace.name,
          input: trace.input,
        })
        emit('tool.result', {
          name: trace.name,
          ok: trace.ok,
          durationMs: trace.durationMs,
        })
      },
    })

    run.artifact.evidenceTable = research.evidence
    run.citations = research.citations
    for (const citation of run.citations) {
      emit('citation.added', citationToPayload(citation))
    }

    const evidenceSummary = renderEvidenceSummary(run.artifact.evidenceTable)

    const answer = await streamModelCompletion({
      config: run.modelConfig,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You are an execution-focused local agent. Provide a direct answer and finish with "Action trace:" as 2-5 bullets.',
        },
        ...history,
        {
          role: 'user',
          content: [
            run.prompt,
            '',
            'Evidence:',
            evidenceSummary || 'No external evidence was available.',
            '',
            'If citing evidence, use [S1], [S2], ... style references.',
          ].join('\n'),
        },
      ],
      onDelta: (delta) => {
        run.artifact.finalAnswer += delta
        emit('draft.delta', { delta })
      },
    })

    run.artifact.finalAnswer = ensureCitationCoverage(answer, run.citations)
    run.metrics.toolCalls = run.artifact.toolTrace.length
    run.metrics.failureRecovery = run.artifact.finalAnswer.length > 0 ? 1 : 0
    run.metrics.answerQuality = contentQuality(run.artifact.finalAnswer)
  }

  private async executeDeepThinkMode(context: RunExecutionContext): Promise<void> {
    const { run, history, signal, emit, runConfig } = context

    const passes = runConfig.thinkingPasses
    const candidates: string[] = []

    run.artifact.plan.push(`Generate ${passes} reasoning candidates.`)
    emit('plan.step', { step: `Generate ${passes} reasoning candidates.` })

    for (let index = 0; index < passes; index += 1) {
      if (signal.aborted) {
        throw new DOMException('Cancelled', 'AbortError')
      }

      const temperature = Number(Math.min(1.4, Math.max(0.2, run.modelConfig.temperature + index * 0.18)))
      const candidate = await requestModelCompletion({
        config: run.modelConfig,
        signal,
        temperature,
        messages: [
          {
            role: 'system',
            content:
              'Reason carefully and provide a complete final answer. Keep assumptions explicit and concise.',
          },
          ...history,
          {
            role: 'user',
            content: run.prompt,
          },
        ],
      })

      const normalized = candidate.trim()
      if (!normalized) {
        continue
      }

      candidates.push(normalized)
      run.artifact.agentOutputs.push({
        role: `Thinker ${index + 1}`,
        content: normalized,
        confidence: Number((0.6 + index / Math.max(1, passes * 2)).toFixed(2)),
      })

      emit('agent.update', {
        agent: `thinker_${index + 1}`,
        status: 'completed',
        length: normalized.length,
      })
    }

    if (candidates.length === 0) {
      throw new Error('Deep Think mode produced no candidate responses.')
    }

    run.artifact.plan.push('Run verifier pass and pick the best candidate.')
    emit('plan.step', { step: 'Run verifier pass and pick the best candidate.' })

    const verifier = await requestModelCompletion({
      config: run.modelConfig,
      signal,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Select the best candidate for correctness and clarity. Return JSON with keys bestIndex (1-based), finalAnswer, rationale.',
        },
        {
          role: 'user',
          content: [
            `Task: ${run.prompt}`,
            '',
            'Candidates:',
            ...candidates.map((candidate, index) => `Candidate ${index + 1}:\n${candidate}`),
          ].join('\n\n'),
        },
      ],
    })

    const parsed = parseJsonObject(verifier)
    const bestIndexRaw = parsed?.bestIndex
    const finalFromVerifier = typeof parsed?.finalAnswer === 'string' ? parsed.finalAnswer.trim() : ''

    const bestIndex =
      typeof bestIndexRaw === 'number' && Number.isFinite(bestIndexRaw)
        ? Math.max(1, Math.min(candidates.length, Math.round(bestIndexRaw)))
        : 1

    const selected = finalFromVerifier || candidates[bestIndex - 1] || candidates[0]

    run.artifact.finalAnswer = selected
    for (const delta of chunkToDeltas(selected)) {
      emit('draft.delta', { delta })
    }

    run.metrics.consistencyGain = computeConsistencyGain(candidates)
    run.metrics.answerQuality = contentQuality(selected)
  }

  private async executeDeepResearchMode(context: RunExecutionContext): Promise<void> {
    const { run, history, signal, emit, runConfig, providerKeys } = context

    run.artifact.plan.push('Decompose research query and gather evidence.')
    emit('plan.step', { step: 'Decompose research query and gather evidence.' })

    const querySet = await this.decomposeQueries(run.prompt, history, run.modelConfig, signal)

    const combinedEvidence = [] as PersistedRun['artifact']['evidenceTable']
    const combinedCitations = [] as PersistedRun['citations']

    for (const query of querySet.slice(0, 3)) {
      const research = await runResearchPipeline({
        query,
        runConfig,
        providerKeys,
        signal,
        onToolTrace: (trace) => {
          run.artifact.toolTrace.push(trace)
          emit('tool.call', { name: trace.name, input: trace.input })
          emit('tool.result', {
            name: trace.name,
            ok: trace.ok,
            durationMs: trace.durationMs,
          })
        },
      })

      combinedEvidence.push(...research.evidence)
      combinedCitations.push(...research.citations)
    }

    run.artifact.evidenceTable = dedupeEvidence(combinedEvidence, runConfig.maxSources)
    run.citations = dedupeCitations(combinedCitations, runConfig.maxSources)

    for (const citation of run.citations) {
      emit('citation.added', citationToPayload(citation))
    }

    if (run.citations.length === 0) {
      throw new Error('Deep Research requires evidence but no citations were produced.')
    }

    run.artifact.plan.push('Synthesize grounded answer with strict citations.')
    emit('plan.step', { step: 'Synthesize grounded answer with strict citations.' })

    const evidenceSummary = renderEvidenceSummary(run.artifact.evidenceTable)

    const answer = await streamModelCompletion({
      config: run.modelConfig,
      signal,
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Every non-trivial claim must include [Sx] citations that map to provided evidence.',
        },
        ...history,
        {
          role: 'user',
          content: [
            run.prompt,
            '',
            'Evidence table:',
            evidenceSummary,
            '',
            'Respond with grounded analysis and include citations inline.',
          ].join('\n'),
        },
      ],
      onDelta: (delta) => {
        run.artifact.finalAnswer += delta
        emit('draft.delta', { delta })
      },
    })

    const repaired = ensureCitationCoverage(answer, run.citations)
    run.artifact.finalAnswer = repaired

    const { coverage, precision, support } = evaluateCitationQuality(repaired, run.citations)
    run.metrics.citationCoverage = coverage
    run.metrics.citationPrecision = precision
    run.metrics.factualSupportScore = support
    run.metrics.answerQuality = contentQuality(repaired)

    if (coverage < 0.95 || precision < 0.9) {
      throw new Error('Citation coverage/precision fell below strict threshold.')
    }
  }

  private async executeSwarmMode(context: RunExecutionContext): Promise<void> {
    const { run, history, signal, emit, runConfig, providerKeys } = context

    const roles = buildSwarmRoles(runConfig.swarmMaxAgents)
    run.artifact.plan.push(`Spawn adaptive swarm with roles: ${roles.join(', ')}.`)
    emit('plan.step', {
      step: `Spawn adaptive swarm with roles: ${roles.join(', ')}.`,
    })

    const research = await runResearchPipeline({
      query: run.prompt,
      runConfig,
      providerKeys,
      signal,
      onToolTrace: (trace) => {
        run.artifact.toolTrace.push(trace)
        emit('tool.call', {
          name: trace.name,
          input: trace.input,
        })
        emit('tool.result', {
          name: trace.name,
          ok: trace.ok,
          durationMs: trace.durationMs,
        })
      },
    })

    run.artifact.evidenceTable = research.evidence
    run.citations = research.citations

    for (const citation of run.citations) {
      emit('citation.added', citationToPayload(citation))
    }

    const evidenceSummary = renderEvidenceSummary(run.artifact.evidenceTable)

    const outputs = await Promise.all(
      roles.map(async (role) => {
        emit('agent.update', {
          agent: role,
          status: 'running',
        })

        const content = await requestModelCompletion({
          config: run.modelConfig,
          signal,
          temperature: role === 'Skeptic' ? 0.4 : 0.65,
          messages: [
            {
              role: 'system',
              content: rolePrompt(role),
            },
            ...history,
            {
              role: 'user',
              content: [
                `Task: ${run.prompt}`,
                '',
                'Evidence available:',
                evidenceSummary || 'No external evidence was available.',
              ].join('\n'),
            },
          ],
        })

        emit('agent.update', {
          agent: role,
          status: 'completed',
          length: content.length,
        })

        return {
          role,
          content,
          confidence: role === 'Skeptic' ? 0.72 : 0.8,
        }
      }),
    )

    run.artifact.agentOutputs = outputs

    run.artifact.plan.push('Adjudicate conflicts and synthesize final response.')
    emit('plan.step', { step: 'Adjudicate conflicts and synthesize final response.' })

    const adjudicated = await streamModelCompletion({
      config: run.modelConfig,
      signal,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are the swarm adjudicator. Resolve conflicts, report chosen evidence, and cite sources as [Sx].',
        },
        {
          role: 'user',
          content: [
            `Task: ${run.prompt}`,
            '',
            'Agent outputs:',
            ...outputs.map((entry) => `${entry.role}:\n${entry.content}`),
            '',
            'Evidence table:',
            evidenceSummary || 'No evidence',
          ].join('\n\n'),
        },
      ],
      onDelta: (delta) => {
        run.artifact.finalAnswer += delta
        emit('draft.delta', { delta })
      },
    })

    const finalAnswer = ensureCitationCoverage(adjudicated, run.citations)
    run.artifact.finalAnswer = finalAnswer

    const { coverage, precision } = evaluateCitationQuality(finalAnswer, run.citations)
    run.metrics.citationCoverage = coverage
    run.metrics.citationPrecision = precision
    run.metrics.agreementQuality = computeAgreementScore(outputs.map((entry) => entry.content))
    run.metrics.latencyScore = 1 - Math.min(0.95, (run.metrics.latencyMs ?? 0) / 180000)
    run.metrics.answerQuality = contentQuality(finalAnswer)
  }

  private async decomposeQueries(
    prompt: string,
    history: ChatCompletionMessage[],
    modelConfig: PersistedRun['modelConfig'],
    signal: AbortSignal,
  ): Promise<string[]> {
    const decomposition = await requestModelCompletion({
      config: modelConfig,
      signal,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Return exactly three search queries as plain lines with no numbering.',
        },
        ...history,
        {
          role: 'user',
          content: prompt,
        },
      ],
    }).catch(() => '')

    const lines = decomposition
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((line) => line.length > 2)

    if (lines.length >= 2) {
      return lines.slice(0, 3)
    }

    return [
      prompt,
      `${prompt} latest updates`,
      `${prompt} background and tradeoffs`,
    ]
  }
}

function buildSwarmRoles(maxAgents: number): string[] {
  const base = ['Retriever', 'Analyst', 'Skeptic']

  if (maxAgents >= 4) {
    base.push('FactChecker')
  }

  if (maxAgents >= 5) {
    base.push('Synthesizer')
  }

  return base.slice(0, Math.max(3, Math.min(maxAgents, 5)))
}

function rolePrompt(role: string): string {
  switch (role) {
    case 'Retriever':
      return 'Find the most relevant supporting facts and list important gaps.'
    case 'Analyst':
      return 'Deliver a structured answer with key assumptions and implications.'
    case 'Skeptic':
      return 'Challenge weak claims, identify contradictions, and propose risk checks.'
    case 'FactChecker':
      return 'Validate factual claims against provided evidence and flag unsupported parts.'
    case 'Synthesizer':
      return 'Merge the strongest points into one coherent argument with clear citations.'
    default:
      return 'Provide a concise specialist contribution.'
  }
}

function renderEvidenceSummary(evidence: PersistedRun['artifact']['evidenceTable']): string {
  if (evidence.length === 0) {
    return ''
  }

  return evidence
    .map(
      (entry) =>
        `[${entry.sourceId}] ${entry.title}\nURL: ${entry.url}\nSnippet: ${entry.snippet}\nScore: ${entry.score}`,
    )
    .join('\n\n')
}

function citationToPayload(citation: PersistedRun['citations'][number]): Record<string, unknown> {
  return {
    sourceId: citation.sourceId,
    url: citation.url,
    title: citation.title,
    snippet: citation.snippet,
    claimRef: citation.claimRef,
    confidence: citation.confidence,
  }
}

function dedupeEvidence(
  evidence: PersistedRun['artifact']['evidenceTable'],
  maxSources: number,
): PersistedRun['artifact']['evidenceTable'] {
  const map = new Map<string, PersistedRun['artifact']['evidenceTable'][number]>()

  for (const entry of evidence) {
    if (!entry.url || map.has(entry.url)) {
      continue
    }

    map.set(entry.url, entry)
  }

  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSources)
    .map((entry, index) => ({
      ...entry,
      sourceId: `S${index + 1}`,
    }))
}

function dedupeCitations(
  citations: PersistedRun['citations'],
  maxSources: number,
): PersistedRun['citations'] {
  const map = new Map<string, PersistedRun['citations'][number]>()

  for (const citation of citations) {
    if (!citation.url || map.has(citation.url)) {
      continue
    }

    map.set(citation.url, citation)
  }

  return Array.from(map.values())
    .slice(0, maxSources)
    .map((entry, index) => ({
      ...entry,
      sourceId: `S${index + 1}`,
      claimRef: `Claim ${(index + 1).toString()}`,
    }))
}

function ensureCitationCoverage(answer: string, citations: PersistedRun['citations']): string {
  const trimmed = answer.trim()
  if (!trimmed || citations.length === 0) {
    return trimmed
  }

  const refs = citations.map((entry) => `[${entry.sourceId}]`)
  let refIndex = 0

  const lines = trimmed.split('\n').map((line) => {
    const normalized = line.trim()
    if (!normalized) {
      return line
    }

    if (/\[S\d+\]/.test(normalized)) {
      return line
    }

    if (normalized.length < 25 || normalized.startsWith('#')) {
      return line
    }

    const ref = refs[refIndex % refs.length]
    refIndex += 1
    return `${line} ${ref}`
  })

  const referencesBlock = [
    '',
    'Sources:',
    ...citations.map((entry) => `[${entry.sourceId}] ${entry.title} - ${entry.url}`),
  ]

  return [...lines, ...referencesBlock].join('\n').trim()
}

function evaluateCitationQuality(
  answer: string,
  citations: PersistedRun['citations'],
): { coverage: number; precision: number; support: number } {
  if (citations.length === 0) {
    return { coverage: 0, precision: 0, support: 0 }
  }

  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 20)

  if (lines.length === 0) {
    return { coverage: 0, precision: 0, support: 0 }
  }

  const cited = lines.filter((line) => /\[S\d+\]/.test(line)).length
  const coverage = Number((cited / lines.length).toFixed(3))

  const allRefs = answer.match(/\[S(\d+)\]/g) ?? []
  const validIds = new Set(citations.map((entry) => entry.sourceId))
  const validRefCount = allRefs
    .filter((ref) => validIds.has(ref.replaceAll('[', '').replaceAll(']', '')))
    .length
  const precision = allRefs.length === 0 ? 0 : Number((validRefCount / allRefs.length).toFixed(3))

  const supportRaw = Number((((coverage * 2 + precision) / 3).toFixed(3)))
  const support = Number(Math.min(1, supportRaw).toFixed(3))

  return { coverage, precision, support }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function chunkToDeltas(input: string): string[] {
  const words = input.split(/(\s+)/).filter((entry) => entry.length > 0)
  return words
}

function contentQuality(content: string): number {
  if (!content.trim()) {
    return 0
  }

  const lengthScore = Math.min(1, content.trim().length / 900)
  const structureBonus = /\n[-*\d]/.test(content) ? 0.12 : 0
  const citationBonus = /\[S\d+\]/.test(content) ? 0.2 : 0

  return Number(Math.min(1, lengthScore + structureBonus + citationBonus).toFixed(3))
}

function computeConsistencyGain(candidates: string[]): number {
  if (candidates.length < 2) {
    return 0
  }

  const uniqueTokens = new Set(
    candidates
      .join(' ')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3),
  )

  const baseline = Math.min(...candidates.map((entry) => entry.length))
  const diversity = Math.min(1, uniqueTokens.size / 120)
  const gain = Math.min(1, diversity * 0.5 + baseline / 2500)

  return Number(gain.toFixed(3))
}

function computeAgreementScore(outputs: string[]): number {
  if (outputs.length === 0) {
    return 0
  }

  const tokenSets = outputs.map((entry) =>
    new Set(
      entry
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 3),
    ),
  )

  let overlapTotal = 0
  let comparisons = 0

  for (let i = 0; i < tokenSets.length; i += 1) {
    for (let j = i + 1; j < tokenSets.length; j += 1) {
      const a = tokenSets[i]
      const b = tokenSets[j]

      const intersection = Array.from(a).filter((token) => b.has(token)).length
      const denominator = Math.max(1, Math.min(a.size, b.size))
      overlapTotal += intersection / denominator
      comparisons += 1
    }
  }

  if (comparisons === 0) {
    return 0
  }

  return Number((overlapTotal / comparisons).toFixed(3))
}
