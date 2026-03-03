import type { BenchmarkModeResult, BenchmarkReport, PersistedRun } from './types'

const THRESHOLDS = {
  citationCoverage: 0.95,
  citationPrecision: 0.9,
  agentTaskSuccess: 0.75,
  deepThinkConsistencyGain: 0.1,
  swarmGainOverAgent: 0.08,
} as const

export function buildBenchmarkReport(runs: PersistedRun[]): BenchmarkReport {
  const now = new Date().toISOString()
  const id = `bench-${crypto.randomUUID()}`

  const agentRuns = runs.filter((entry) => entry.mode === 'agent')
  const thinkRuns = runs.filter((entry) => entry.mode === 'deep_think')
  const researchRuns = runs.filter((entry) => entry.mode === 'deep_research')
  const swarmRuns = runs.filter((entry) => entry.mode === 'swarm')

  const agentSuccess = successRate(agentRuns)
  const agentEfficiency = clamp01(1 - avgMetric(agentRuns, 'toolCalls') / 12)
  const agentRecovery = avgMetric(agentRuns, 'failureRecovery', 0)

  const deepThinkConsistency = avgMetric(thinkRuns, 'consistencyGain', 0)
  const deepThinkAccuracyProxy = avgMetric(thinkRuns, 'answerQuality', 0)

  const deepResearchCoverage = avgMetric(researchRuns, 'citationCoverage', 0)
  const deepResearchPrecision = avgMetric(researchRuns, 'citationPrecision', 0)
  const deepResearchSupport = avgMetric(researchRuns, 'factualSupportScore', 0)

  const swarmSuccess = successRate(swarmRuns)
  const swarmAgreement = avgMetric(swarmRuns, 'agreementQuality', 0)
  const swarmLatencyScore = avgMetric(swarmRuns, 'latencyScore', 0)

  const agentResult: BenchmarkModeResult = {
    pass: agentSuccess >= THRESHOLDS.agentTaskSuccess,
    metrics: {
      taskSuccessRate: agentSuccess,
      toolEfficiency: agentEfficiency,
      failureRecovery: agentRecovery,
    },
    thresholds: {
      taskSuccessRate: THRESHOLDS.agentTaskSuccess,
    },
  }

  const deepThinkResult: BenchmarkModeResult = {
    pass: deepThinkConsistency >= THRESHOLDS.deepThinkConsistencyGain,
    metrics: {
      consistencyGain: deepThinkConsistency,
      answerQuality: deepThinkAccuracyProxy,
    },
    thresholds: {
      consistencyGain: THRESHOLDS.deepThinkConsistencyGain,
    },
  }

  const deepResearchResult: BenchmarkModeResult = {
    pass:
      deepResearchCoverage >= THRESHOLDS.citationCoverage &&
      deepResearchPrecision >= THRESHOLDS.citationPrecision,
    metrics: {
      citationCoverage: deepResearchCoverage,
      citationPrecision: deepResearchPrecision,
      factualSupportScore: deepResearchSupport,
    },
    thresholds: {
      citationCoverage: THRESHOLDS.citationCoverage,
      citationPrecision: THRESHOLDS.citationPrecision,
    },
  }

  const swarmResult: BenchmarkModeResult = {
    pass:
      swarmSuccess >= agentSuccess + THRESHOLDS.swarmGainOverAgent &&
      deepResearchCoverage >= THRESHOLDS.citationCoverage,
    metrics: {
      taskSuccessRate: swarmSuccess,
      agreementQuality: swarmAgreement,
      latencyScore: swarmLatencyScore,
      gainOverAgent: Number((swarmSuccess - agentSuccess).toFixed(3)),
    },
    thresholds: {
      gainOverAgent: THRESHOLDS.swarmGainOverAgent,
      citationCoverage: THRESHOLDS.citationCoverage,
    },
  }

  const gatePassed =
    agentResult.pass &&
    deepThinkResult.pass &&
    deepResearchResult.pass &&
    swarmResult.pass

  return {
    id,
    generatedAt: now,
    gatePassed,
    modes: {
      agent: agentResult,
      deepThink: deepThinkResult,
      deepResearch: deepResearchResult,
      swarm: swarmResult,
    },
  }
}

function successRate(runs: PersistedRun[]): number {
  if (runs.length === 0) {
    return 0
  }

  const successful = runs.filter((entry) => entry.status === 'completed').length
  return Number((successful / runs.length).toFixed(3))
}

function avgMetric(runs: PersistedRun[], key: string, fallback = 0): number {
  if (runs.length === 0) {
    return fallback
  }

  const values = runs
    .map((entry) => entry.metrics[key])
    .filter((value): value is number => Number.isFinite(value))

  if (values.length === 0) {
    return fallback
  }

  const sum = values.reduce((acc, value) => acc + value, 0)
  return Number((sum / values.length).toFixed(3))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))))
}
