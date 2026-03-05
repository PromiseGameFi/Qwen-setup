import { describe, expect, it } from 'vitest'

import { loadDefaultKnowledgeManifest, retrieveKnowledge } from '../packages/knowledge-pack/src'

describe('knowledge pack retrieval', () => {
  it('returns relevant lexical hits', () => {
    const manifest = loadDefaultKnowledgeManifest()
    const hits = retrieveKnowledge('how to do patch first coding with test loop', manifest, 3)

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.score).toBeGreaterThan(0)
  })
})
