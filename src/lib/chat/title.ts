const MAX_TITLE_CHARS = 64

export function buildTitleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'New Chat'
  }

  const words = normalized.split(' ')
  const candidate = words.slice(0, 8).join(' ')

  if (candidate.length <= MAX_TITLE_CHARS) {
    return candidate
  }

  return `${candidate.slice(0, MAX_TITLE_CHARS - 3).trimEnd()}...`
}

export function isDefaultThreadTitle(title: string): boolean {
  return title.trim().toLowerCase() === 'new chat'
}
