import type { AgentRunEvent } from '@webide/protocol'

import type { ProblemItem } from '../types/ui'

const structuredProblemRegex = /([^\s:]+\.[a-z0-9]+):(\d+)(?::\d+)?\s+(error|warning)[:\s]+(.+)/i

export function deriveProblems(commandOutput: string, events: AgentRunEvent[]): ProblemItem[] {
  const results: ProblemItem[] = []

  for (const line of commandOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const structured = trimmed.match(structuredProblemRegex)
    if (structured) {
      results.push({
        source: 'terminal',
        file: structured[1],
        line: Number.parseInt(structured[2] ?? '0', 10) || undefined,
        severity: structured[3]?.toLowerCase() === 'warning' ? 'warning' : 'error',
        message: structured[4] ?? trimmed,
      })
      continue
    }

    const lower = trimmed.toLowerCase()
    if (lower.includes('error')) {
      results.push({
        source: 'terminal',
        severity: 'error',
        message: trimmed,
      })
      continue
    }

    if (lower.includes('warning')) {
      results.push({
        source: 'terminal',
        severity: 'warning',
        message: trimmed,
      })
    }
  }

  for (const event of events) {
    if (event.kind === 'run.failed') {
      results.push({
        source: 'agent',
        severity: 'error',
        message: String(event.payload.message ?? 'Agent run failed.'),
      })
      continue
    }

    if (event.kind === 'command.output') {
      const stream = String(event.payload.stream ?? '')
      const text = String(event.payload.text ?? '')
      if (stream === 'stderr' && text.trim()) {
        results.push({
          source: 'agent',
          severity: text.toLowerCase().includes('warning') ? 'warning' : 'error',
          message: text.trim().slice(0, 300),
        })
      }
    }
  }

  return dedupeProblems(results).slice(0, 150)
}

function dedupeProblems(items: ProblemItem[]): ProblemItem[] {
  const seen = new Set<string>()
  const deduped: ProblemItem[] = []

  for (const item of items) {
    const key = `${item.source}|${item.severity}|${item.file ?? ''}|${item.line ?? ''}|${item.message}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(item)
  }

  return deduped
}
