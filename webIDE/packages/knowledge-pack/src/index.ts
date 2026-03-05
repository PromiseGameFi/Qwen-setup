import { DEFAULT_KNOWLEDGE_MANIFEST } from './defaultManifest.js'

export interface KnowledgeChunk {
  id: string
  title: string
  text: string
  tags: string[]
  citation: string
}

export interface KnowledgeManifest {
  version: string
  embeddingVersion: string
  installedAt: string
  sources: string[]
  chunks: KnowledgeChunk[]
}

export interface RetrievalHit {
  chunkId: string
  title: string
  score: number
  text: string
  citation: string
}

export function loadDefaultKnowledgeManifest(): KnowledgeManifest {
  return JSON.parse(JSON.stringify(DEFAULT_KNOWLEDGE_MANIFEST)) as KnowledgeManifest
}

export function retrieveKnowledge(query: string, manifest: KnowledgeManifest, limit = 5): RetrievalHit[] {
  const normalized = tokenize(query)
  if (normalized.length === 0) {
    return []
  }

  const hits = manifest.chunks
    .map((chunk) => {
      const chunkTokens = tokenize(`${chunk.title} ${chunk.text} ${chunk.tags.join(' ')}`)
      const overlap = scoreOverlap(normalized, chunkTokens)
      return {
        chunk,
        score: overlap,
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))

  return hits.map((entry) => ({
    chunkId: entry.chunk.id,
    title: entry.chunk.title,
    score: Number(entry.score.toFixed(3)),
    text: entry.chunk.text,
    citation: entry.chunk.citation,
  }))
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function scoreOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0
  }

  const bSet = new Set(b)
  let overlap = 0
  for (const token of a) {
    if (bSet.has(token)) {
      overlap += 1
    }
  }

  return overlap / a.length
}
