import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

import type { Citation, EvidenceRow, ProviderKeys, RunConfig, ToolTraceEntry } from './types'

interface SearchResult {
  url: string
  title: string
  snippet: string
  provider: 'tavily' | 'brave' | 'fallback'
}

interface SourceContent {
  url: string
  title: string
  snippet: string
  text: string
}

interface ResearchPipelineOptions {
  query: string
  runConfig: RunConfig
  providerKeys: ProviderKeys
  signal?: AbortSignal
  onToolTrace: (trace: ToolTraceEntry) => void
}

export interface ResearchPipelineResult {
  evidence: EvidenceRow[]
  citations: Citation[]
  warnings: string[]
}

const DEFAULT_TIMEOUT_MS = 12000

export async function runResearchPipeline({
  query,
  runConfig,
  providerKeys,
  signal,
  onToolTrace,
}: ResearchPipelineOptions): Promise<ResearchPipelineResult> {
  const warnings: string[] = []

  const searchStart = performance.now()
  const searchResults = await searchWeb(query, providerKeys, runConfig.maxSources, signal)
  onToolTrace({
    name: 'search',
    input: query,
    output: JSON.stringify(searchResults.map((entry) => entry.url)),
    durationMs: Math.round(performance.now() - searchStart),
    ok: searchResults.length > 0,
  })

  if (searchResults.length === 0) {
    warnings.push('No search results were found from configured providers.')
    return {
      evidence: [],
      citations: [],
      warnings,
    }
  }

  const fetchStart = performance.now()
  const sourceDocs = await fetchSources(searchResults, runConfig.maxSources, signal)
  onToolTrace({
    name: 'fetch_extract',
    input: JSON.stringify(searchResults.slice(0, runConfig.maxSources).map((entry) => entry.url)),
    output: JSON.stringify(sourceDocs.map((entry) => entry.url)),
    durationMs: Math.round(performance.now() - fetchStart),
    ok: sourceDocs.length > 0,
  })

  if (sourceDocs.length === 0) {
    warnings.push('No source pages could be fetched/extracted.')
    return {
      evidence: [],
      citations: [],
      warnings,
    }
  }

  const evidence = buildEvidenceRows(query, sourceDocs, runConfig.maxSources)
  const citations = evidence.map((entry, index) => ({
    sourceId: `S${index + 1}`,
    url: entry.url,
    title: entry.title,
    snippet: entry.snippet,
    claimRef: `Claim ${(index + 1).toString()}`,
    confidence: Math.max(0.35, Math.min(0.98, entry.score)),
  }))

  return {
    evidence,
    citations,
    warnings,
  }
}

async function searchWeb(
  query: string,
  providerKeys: ProviderKeys,
  maxSources: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const [tavilyResults, braveResults, fallbackResults] = await Promise.all([
    searchTavily(query, providerKeys.tavilyApiKey, maxSources, signal),
    searchBrave(query, providerKeys.braveApiKey, maxSources, signal),
    searchFallback(query, maxSources, signal),
  ])

  const merged = dedupeByUrl([...tavilyResults, ...braveResults, ...fallbackResults])
  return merged.slice(0, maxSources * 2)
}

async function searchTavily(
  query: string,
  apiKey: string | undefined,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (!apiKey) {
    return []
  }

  const response = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: false,
        max_results: Math.max(3, Math.min(maxResults * 2, 12)),
      }),
      signal,
    },
    DEFAULT_TIMEOUT_MS,
  ).catch(() => null)

  if (!response?.ok) {
    return []
  }

  const payload = (await response.json().catch(() => null)) as
    | { results?: Array<{ url?: string; title?: string; content?: string }> }
    | null

  if (!payload?.results || !Array.isArray(payload.results)) {
    return []
  }

  return payload.results
    .map((entry) => ({
      url: typeof entry.url === 'string' ? entry.url : '',
      title: typeof entry.title === 'string' ? entry.title : 'Untitled',
      snippet: typeof entry.content === 'string' ? entry.content : '',
      provider: 'tavily' as const,
    }))
    .filter((entry) => Boolean(entry.url))
}

async function searchBrave(
  query: string,
  apiKey: string | undefined,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (!apiKey) {
    return []
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.max(3, Math.min(maxResults * 2, 12))))

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal,
    },
    DEFAULT_TIMEOUT_MS,
  ).catch(() => null)

  if (!response?.ok) {
    return []
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        web?: {
          results?: Array<{
            url?: string
            title?: string
            description?: string
          }>
        }
      }
    | null

  const results = payload?.web?.results
  if (!results || !Array.isArray(results)) {
    return []
  }

  return results
    .map((entry) => ({
      url: typeof entry.url === 'string' ? entry.url : '',
      title: typeof entry.title === 'string' ? entry.title : 'Untitled',
      snippet: typeof entry.description === 'string' ? entry.description : '',
      provider: 'brave' as const,
    }))
    .filter((entry) => Boolean(entry.url))
}

async function searchFallback(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const endpoint = new URL('https://api.duckduckgo.com/')
  endpoint.searchParams.set('q', query)
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('no_html', '1')
  endpoint.searchParams.set('skip_disambig', '1')

  const response = await fetchWithTimeout(endpoint.toString(), { signal }, DEFAULT_TIMEOUT_MS).catch(
    () => null,
  )

  if (!response?.ok) {
    return []
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        RelatedTopics?: Array<{
          FirstURL?: string
          Text?: string
        }>
      }
    | null

  const topics = payload?.RelatedTopics
  if (!topics || !Array.isArray(topics)) {
    return []
  }

  return topics
    .flatMap((topic) => {
      if (topic && typeof topic.FirstURL === 'string') {
        return [
          {
            url: topic.FirstURL,
            title: topic.Text?.split(' - ')[0] ?? 'DuckDuckGo Result',
            snippet: topic.Text ?? '',
            provider: 'fallback' as const,
          },
        ]
      }

      return []
    })
    .slice(0, maxResults)
}

function dedupeByUrl(results: SearchResult[]): SearchResult[] {
  const map = new Map<string, SearchResult>()

  for (const result of results) {
    const normalized = normalizeUrl(result.url)
    if (!normalized || map.has(normalized)) {
      continue
    }

    map.set(normalized, {
      ...result,
      url: normalized,
    })
  }

  return Array.from(map.values())
}

async function fetchSources(
  results: SearchResult[],
  maxSources: number,
  signal?: AbortSignal,
): Promise<SourceContent[]> {
  const selected = results.slice(0, Math.max(maxSources * 2, 4))

  const docs = await Promise.all(
    selected.map(async (result) => {
      const doc = await fetchAndExtract(result.url, signal)
      if (!doc) {
        return null
      }

      return {
        url: result.url,
        title: doc.title || result.title,
        snippet: result.snippet,
        text: doc.text,
      }
    }),
  )

  return docs.filter((entry): entry is SourceContent => Boolean(entry)).slice(0, maxSources)
}

async function fetchAndExtract(
  url: string,
  signal?: AbortSignal,
): Promise<{ title: string; text: string } | null> {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        'user-agent': 'QwenAgentRuntime/1.0 (+local)',
      },
      signal,
    },
    DEFAULT_TIMEOUT_MS,
  ).catch(() => null)

  if (!response?.ok) {
    return null
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const isText =
    contentType.includes('text/html') ||
    contentType.includes('text/plain') ||
    contentType.includes('application/xhtml+xml')

  if (!isText) {
    return null
  }

  const raw = await response.text().catch(() => '')
  if (!raw) {
    return null
  }

  if (contentType.includes('text/plain')) {
    return {
      title: new URL(url).hostname,
      text: raw.slice(0, 24000),
    }
  }

  const dom = new JSDOM(raw, { url })
  const article = new Readability(dom.window.document).parse()

  if (!article?.textContent) {
    return {
      title: article?.title ?? dom.window.document.title || new URL(url).hostname,
      text: dom.window.document.body?.textContent?.slice(0, 24000) ?? '',
    }
  }

  return {
    title: article.title || new URL(url).hostname,
    text: article.textContent.slice(0, 24000),
  }
}

function buildEvidenceRows(query: string, docs: SourceContent[], maxSources: number): EvidenceRow[] {
  const chunks = docs.flatMap((doc) => {
    const parts = chunkText(doc.text, 1400, 180).slice(0, 6)
    return parts.map((part) => ({
      url: doc.url,
      title: doc.title,
      snippet: doc.snippet || part.slice(0, 220),
      score: scoreText(query, part),
    }))
  })

  const topChunks = chunks
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(maxSources, 3))

  return topChunks.map((chunk, index) => ({
    sourceId: `S${index + 1}`,
    url: chunk.url,
    title: chunk.title,
    snippet: chunk.snippet,
    score: Number(chunk.score.toFixed(3)),
  }))
}

function chunkText(text: string, size: number, overlap: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  if (normalized.length <= size) {
    return [normalized]
  }

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + size)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) {
      break
    }

    start = Math.max(0, end - overlap)
  }

  return chunks
}

function scoreText(query: string, text: string): number {
  const queryTerms = tokenize(query)
  if (queryTerms.size === 0) {
    return 0
  }

  const bodyTerms = tokenize(text)
  let overlap = 0

  for (const term of queryTerms) {
    if (bodyTerms.has(term)) {
      overlap += 1
    }
  }

  return overlap / queryTerms.size
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 2),
  )
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return ''
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const signal = mergeSignals(init.signal, controller.signal)

  try {
    return await fetch(url, {
      ...init,
      signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function mergeSignals(a?: AbortSignal | null, b?: AbortSignal | null): AbortSignal | undefined {
  if (!a) {
    return b ?? undefined
  }

  if (!b) {
    return a
  }

  const controller = new AbortController()

  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  if (a.aborted || b.aborted) {
    abort()
    return controller.signal
  }

  a.addEventListener('abort', abort, { once: true })
  b.addEventListener('abort', abort, { once: true })

  return controller.signal
}
