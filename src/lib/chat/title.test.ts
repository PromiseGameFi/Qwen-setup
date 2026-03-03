import { describe, expect, it } from 'vitest'

import { buildTitleFromPrompt, isDefaultThreadTitle } from './title'

describe('title helpers', () => {
  it('returns default title for blank prompt', () => {
    expect(buildTitleFromPrompt('   ')).toBe('New Chat')
  })

  it('builds concise title from prompt words', () => {
    expect(buildTitleFromPrompt('Summarize this API response and generate migration tasks')).toBe(
      'Summarize this API response and generate migration tasks',
    )
  })

  it('detects default title', () => {
    expect(isDefaultThreadTitle('New Chat')).toBe(true)
    expect(isDefaultThreadTitle('Feature Planning')).toBe(false)
  })
})
