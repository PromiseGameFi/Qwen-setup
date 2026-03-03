import type { ChatCompletionMessage } from './api/openaiClient'
import type { ChatMessage } from '../types/chat'

export interface AgentBrainConfig {
  version: number
  agent: {
    name: string
    identity: string
    mission: string
  }
  response: {
    tone: string
    rules: string[]
  }
  welcome: {
    enabled: boolean
    maxWords: number
    instructions: string
    variationRules: string[]
    openerPool: string[]
    stylePool: string[]
    closingPool: string[]
  }
}

export const DEFAULT_AGENT_BRAIN: AgentBrainConfig = {
  version: 1,
  agent: {
    name: 'Qwency',
    identity: 'A local AI assistant focused on practical, accurate help.',
    mission: 'Help the user finish tasks with clear, reliable steps.',
  },
  response: {
    tone: 'professional, clear, and helpful',
    rules: [
      'Prefer concrete steps and examples.',
      'Keep answers tightly aligned to the user request.',
      'State uncertainty briefly when needed.',
    ],
  },
  welcome: {
    enabled: true,
    maxWords: 55,
    instructions: 'On the first assistant turn, add a short welcome before answering.',
    variationRules: [
      'Do not reuse the exact same opening sentence across new threads.',
      'Vary wording and rhythm naturally.',
      'Keep the intro brief and proceed to the answer.',
    ],
    openerPool: [
      'Glad to help today.',
      'Ready to get started.',
      'Happy to jump in.',
    ],
    stylePool: ['direct and crisp', 'warm and calm', 'focused and minimal'],
    closingPool: [
      'What should we tackle first?',
      'Share your goal and I will break it down.',
      'Tell me the first task and constraints.',
    ],
  },
}

interface BuildSystemPromptOptions {
  threadId: string
  isFirstAssistantTurn: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed || fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)

  return normalized.length > 0 ? normalized : fallback
}

function normalizeAgentBrain(raw: unknown): AgentBrainConfig {
  if (!isRecord(raw)) {
    return DEFAULT_AGENT_BRAIN
  }

  const agent = isRecord(raw.agent) ? raw.agent : {}
  const response = isRecord(raw.response) ? raw.response : {}
  const welcome = isRecord(raw.welcome) ? raw.welcome : {}

  return {
    version: Math.max(1, Math.round(numberOr(raw.version, DEFAULT_AGENT_BRAIN.version))),
    agent: {
      name: stringOr(agent.name, DEFAULT_AGENT_BRAIN.agent.name),
      identity: stringOr(agent.identity, DEFAULT_AGENT_BRAIN.agent.identity),
      mission: stringOr(agent.mission, DEFAULT_AGENT_BRAIN.agent.mission),
    },
    response: {
      tone: stringOr(response.tone, DEFAULT_AGENT_BRAIN.response.tone),
      rules: stringArrayOr(response.rules, DEFAULT_AGENT_BRAIN.response.rules),
    },
    welcome: {
      enabled: boolOr(welcome.enabled, DEFAULT_AGENT_BRAIN.welcome.enabled),
      maxWords: Math.max(16, Math.round(numberOr(welcome.maxWords, DEFAULT_AGENT_BRAIN.welcome.maxWords))),
      instructions: stringOr(welcome.instructions, DEFAULT_AGENT_BRAIN.welcome.instructions),
      variationRules: stringArrayOr(welcome.variationRules, DEFAULT_AGENT_BRAIN.welcome.variationRules),
      openerPool: stringArrayOr(welcome.openerPool, DEFAULT_AGENT_BRAIN.welcome.openerPool),
      stylePool: stringArrayOr(welcome.stylePool, DEFAULT_AGENT_BRAIN.welcome.stylePool),
      closingPool: stringArrayOr(welcome.closingPool, DEFAULT_AGENT_BRAIN.welcome.closingPool),
    },
  }
}

function pickRandom(items: string[]): string {
  if (items.length === 0) {
    return ''
  }

  const index = Math.floor(Math.random() * items.length)
  return items[index] ?? ''
}

export function buildAgentSystemPrompt(
  brain: AgentBrainConfig,
  { threadId, isFirstAssistantTurn }: BuildSystemPromptOptions,
): string {
  const openerHint = pickRandom(brain.welcome.openerPool)
  const styleHint = pickRandom(brain.welcome.stylePool)
  const closingHint = pickRandom(brain.welcome.closingPool)
  const variationSeed = Math.floor(Math.random() * 1_000_000_000)

  const lines = [
    `You are ${brain.agent.name}.`,
    `Identity: ${brain.agent.identity}`,
    `Mission: ${brain.agent.mission}`,
    `Tone: ${brain.response.tone}.`,
    'Response rules:',
    ...brain.response.rules.map((rule, index) => `${index + 1}. ${rule}`),
  ]

  if (brain.welcome.enabled && isFirstAssistantTurn) {
    lines.push(
      'First-turn welcome policy:',
      `- ${brain.welcome.instructions}`,
      `- Keep welcome under ${brain.welcome.maxWords} words.`,
      ...brain.welcome.variationRules.map((rule) => `- ${rule}`),
      `- Welcome style hint for this thread: ${styleHint}.`,
      `- Suggested opener concept: ${openerHint}.`,
      `- Suggested closing concept: ${closingHint}.`,
      `- Variation seed: ${threadId}-${variationSeed}.`,
    )
  }

  return lines.join('\n')
}

export async function loadAgentBrain(): Promise<AgentBrainConfig> {
  try {
    const response = await fetch('/agent-brain.json', {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      return DEFAULT_AGENT_BRAIN
    }

    const json = (await response.json()) as unknown
    return normalizeAgentBrain(json)
  } catch {
    return DEFAULT_AGENT_BRAIN
  }
}

export async function buildMessagesWithAgentBrain({
  messages,
  threadId,
  isFirstAssistantTurn,
}: {
  messages: ChatMessage[]
  threadId: string
  isFirstAssistantTurn: boolean
}): Promise<ChatCompletionMessage[]> {
  const brain = await loadAgentBrain()
  const systemMessage = buildAgentSystemPrompt(brain, {
    threadId,
    isFirstAssistantTurn,
  })

  const modelMessages: ChatCompletionMessage[] = messages
    .filter(
      (message) =>
        message.role === 'system' || message.role === 'user' || message.role === 'assistant',
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))

  return [
    {
      role: 'system',
      content: systemMessage,
    },
    ...modelMessages,
  ]
}
