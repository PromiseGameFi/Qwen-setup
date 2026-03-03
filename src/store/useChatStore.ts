import { create } from 'zustand'

import {
  cancelRun,
  createRun,
  getLatestBenchmark,
  getRun,
  getRunEventsSince,
  getRuntimeHealth,
  runBenchmark,
  RuntimeTransportError,
  saveProviderKeys,
  streamRun,
} from '../lib/api/agentRuntimeClient'
import { buildMessagesWithAgentBrain } from '../lib/agentBrain'
import { streamChatCompletion, type ChatCompletionMessage } from '../lib/api/openaiClient'
import { buildTitleFromPrompt, isDefaultThreadTitle } from '../lib/chat/title'
import { createExportBundle, parseExportBundle, serializeExportBundle } from '../lib/exportImport'
import { db } from '../lib/storage/db'
import { normalizeSettings } from '../lib/storage/migrations'
import {
  DEFAULT_SETTINGS,
  type AgentRunRecord,
  type AppSettings,
  type BenchmarkReport,
  type ChatMessage,
  type ChatThread,
  type ModeType,
  type ProviderConfig,
  type RuntimeHealthStatus,
  type RunConfig,
  type RunTimelineEvent,
  type UiDensity,
} from '../types/chat'

interface Banner {
  type: 'error' | 'info'
  message: string
}

interface ChatState {
  initialized: boolean
  initializing: boolean
  sending: boolean
  streamController: AbortController | null
  threads: ChatThread[]
  messagesByThread: Record<string, ChatMessage[]>
  activeThreadId: string | null
  settings: AppSettings
  settingsOpen: boolean
  mobileSidebarOpen: boolean
  citationsDrawerOpen: boolean
  searchQuery: string
  banner: Banner | null
  activeMode: ModeType
  timelineByThread: Record<string, RunTimelineEvent[]>
  runsById: Record<string, AgentRunRecord>
  activeRunIdByThread: Record<string, string | null>
  benchmarkReport: BenchmarkReport | null
  benchmarkLoading: boolean
  runtimeHealth: RuntimeHealthStatus
  runtimeHealthMessage: string | null
  runtimeReconnectAttempts: number
  initialize: () => Promise<void>
  createThread: () => Promise<void>
  setActiveThread: (threadId: string) => void
  renameThread: (threadId: string, title: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setSettingsOpen: (open: boolean) => void
  setMobileSidebarOpen: (open: boolean) => void
  setCitationsDrawerOpen: (open: boolean) => void
  setActiveMode: (mode: ModeType) => Promise<void>
  updateProvider: (update: Partial<ProviderConfig>) => Promise<void>
  updateUiDensity: (density: UiDensity) => Promise<void>
  updateSidecarBaseUrl: (baseUrl: string) => Promise<void>
  updateRunConfig: (update: Partial<RunConfig>) => Promise<void>
  updateProviderKeys: (update: { tavilyApiKey?: string; braveApiKey?: string }) => Promise<void>
  clearBanner: () => void
  sendMessage: (prompt: string) => Promise<void>
  stopStreaming: () => void
  regenerateLastResponse: () => Promise<void>
  exportChats: () => Promise<string>
  importChatsFromText: (raw: string) => Promise<void>
  clearAllChats: () => Promise<void>
  runBenchmarks: () => Promise<void>
  refreshBenchmark: () => Promise<void>
  checkRuntimeHealth: () => Promise<void>
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(): string {
  return crypto.randomUUID()
}

function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function replaceThread(threads: ChatThread[], nextThread: ChatThread): ChatThread[] {
  return threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread))
}

function replaceMessage(
  messagesByThread: Record<string, ChatMessage[]>,
  threadId: string,
  messageId: string,
  mutate: (message: ChatMessage) => ChatMessage,
): Record<string, ChatMessage[]> {
  const current = messagesByThread[threadId] ?? []
  return {
    ...messagesByThread,
    [threadId]: current.map((message) =>
      message.id === messageId ? mutate(message) : message,
    ),
  }
}

function groupMessages(messages: ChatMessage[]): Record<string, ChatMessage[]> {
  const map: Record<string, ChatMessage[]> = {}

  for (const message of messages) {
    map[message.threadId] ??= []
    map[message.threadId].push(message)
  }

  for (const threadId of Object.keys(map)) {
    map[threadId].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  return map
}

function groupTimeline(events: RunTimelineEvent[], runsById: Record<string, AgentRunRecord>) {
  const map: Record<string, RunTimelineEvent[]> = {}

  for (const event of events) {
    const run = runsById[event.runId]
    if (!run) {
      continue
    }

    map[run.threadId] ??= []
    map[run.threadId].push(event)
  }

  for (const threadId of Object.keys(map)) {
    map[threadId].sort((a, b) => a.id - b.id)
  }

  return map
}

function buildNewThread(model: string): ChatThread {
  const timestamp = nowIso()
  return {
    id: makeId(),
    title: 'New Chat',
    createdAt: timestamp,
    updatedAt: timestamp,
    model,
  }
}

function buildEmptyRun(id: string, threadId: string, mode: ModeType, prompt: string): AgentRunRecord {
  const timestamp = nowIso()
  return {
    id,
    threadId,
    mode,
    prompt,
    status: 'running',
    createdAt: timestamp,
    updatedAt: timestamp,
    citations: [],
    artifact: {
      plan: [],
      toolTrace: [],
      evidenceTable: [],
      agentOutputs: [],
      finalAnswer: '',
    },
    metrics: {},
    timeline: [],
  }
}

function asError(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(fallback)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isConnectivityBanner(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('cannot reach agent runtime') || normalized.includes('sidecar')
}

async function persistSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ key: 'app', value: normalizeSettings(settings) })
}

export const useChatStore = create<ChatState>((set, get) => {
  const persistCurrentRun = async (runId: string): Promise<void> => {
    const run = get().runsById[runId]
    if (!run) {
      return
    }

    await db.runs.put(run)
  }

  const applyRuntimeHealth = (
    status: RuntimeHealthStatus,
    message?: string | null,
    reconnectAttempts?: number,
  ): void => {
    set((state) => ({
      ...state,
      runtimeHealth: status,
      runtimeHealthMessage: message ?? null,
      runtimeReconnectAttempts:
        reconnectAttempts === undefined ? state.runtimeReconnectAttempts : reconnectAttempts,
      banner:
        status === 'offline' && message
          ? {
              type: 'error',
              message,
            }
          : state.banner && isConnectivityBanner(state.banner.message)
            ? null
            : state.banner,
    }))
  }

  const appendTimelineEvent = (threadId: string, event: RunTimelineEvent): void => {
    set((state) => {
      const nextThreadEvents = [...(state.timelineByThread[threadId] ?? []), event].sort(
        (a, b) => a.id - b.id,
      )

      return {
        ...state,
        timelineByThread: {
          ...state.timelineByThread,
          [threadId]: nextThreadEvents,
        },
      }
    })
  }

  const streamAssistantDirect = async ({
    threadId,
    requestMessages,
    assistantMessageId,
    titlePrompt,
  }: {
    threadId: string
    requestMessages: ChatCompletionMessage[]
    assistantMessageId: string
    titlePrompt?: string
  }): Promise<void> => {
    const state = get()
    const activeThread = state.threads.find((thread) => thread.id === threadId)
    if (!activeThread) {
      return
    }

    const streamController = new AbortController()

    set((current) => ({
      ...current,
      sending: true,
      streamController,
      banner: null,
    }))

    try {
      await streamChatCompletion({
        config: state.settings.provider,
        messages: requestMessages,
        signal: streamController.signal,
        onDelta: (delta) => {
          set((current) => ({
            ...current,
            messagesByThread: replaceMessage(
              current.messagesByThread,
              threadId,
              assistantMessageId,
              (message) => ({ ...message, content: message.content + delta }),
            ),
          }))

          const currentAssistant =
            get()
              .messagesByThread[threadId]
              ?.find((message) => message.id === assistantMessageId)
              ?.content ?? ''

          void db.messages.update(assistantMessageId, {
            content: currentAssistant,
          })
        },
      })

      const finalAssistant =
        get()
          .messagesByThread[threadId]
          ?.find((message) => message.id === assistantMessageId)

      const hasContent = Boolean(finalAssistant?.content.trim())
      const completedMessage: ChatMessage = {
        ...(finalAssistant ?? {
          id: assistantMessageId,
          threadId,
          role: 'assistant',
          content: '',
          createdAt: nowIso(),
          status: 'streaming',
        }),
        status: hasContent ? 'complete' : 'error',
        error: hasContent ? undefined : 'Model returned an empty response.',
      }

      const latestThread = get().threads.find((thread) => thread.id === threadId) ?? activeThread
      const renamedThread: ChatThread = {
        ...latestThread,
        updatedAt: nowIso(),
        title:
          titlePrompt && isDefaultThreadTitle(latestThread.title)
            ? buildTitleFromPrompt(titlePrompt)
            : latestThread.title,
      }

      set((current) => ({
        ...current,
        sending: false,
        streamController: null,
        banner: hasContent
          ? current.banner
          : {
              type: 'error',
              message: 'The model returned an empty response.',
            },
        threads: sortThreads(replaceThread(current.threads, renamedThread)),
        messagesByThread: replaceMessage(
          current.messagesByThread,
          threadId,
          assistantMessageId,
          () => completedMessage,
        ),
      }))

      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.put(renamedThread)
        await db.messages.put(completedMessage)
      })
    } catch (error) {
      const isAbort = streamController.signal.aborted
      const fallbackError =
        error instanceof Error && error.message ? error.message : 'Failed to generate response.'

      const currentAssistant =
        get()
          .messagesByThread[threadId]
          ?.find((message) => message.id === assistantMessageId)

      const hasContent = Boolean(currentAssistant?.content.trim())

      const erroredAssistant: ChatMessage = {
        ...(currentAssistant ?? {
          id: assistantMessageId,
          threadId,
          role: 'assistant',
          content: '',
          createdAt: nowIso(),
          status: 'streaming',
        }),
        status: hasContent && isAbort ? 'complete' : 'error',
        error: hasContent && isAbort ? undefined : fallbackError,
      }

      set((current) => ({
        ...current,
        sending: false,
        streamController: null,
        banner:
          hasContent && isAbort
            ? current.banner
            : {
                type: 'error',
                message: isAbort ? 'Generation stopped.' : fallbackError,
              },
        messagesByThread: replaceMessage(
          current.messagesByThread,
          threadId,
          assistantMessageId,
          () => erroredAssistant,
        ),
      }))

      await db.messages.put(erroredAssistant)
    }
  }

  const streamAssistantAdvanced = async ({
    threadId,
    prompt,
    baseMessages,
    assistantMessageId,
    mode,
    titlePrompt,
  }: {
    threadId: string
    prompt: string
    baseMessages: ChatMessage[]
    assistantMessageId: string
    mode: ModeType
    titlePrompt?: string
  }): Promise<void> => {
    const state = get()
    const streamController = new AbortController()

    set((current) => ({
      ...current,
      sending: true,
      streamController,
      banner: null,
    }))

    const preflightHealth = await getRuntimeHealth(state.settings.runtime.sidecarBaseUrl)
    applyRuntimeHealth(preflightHealth.status, preflightHealth.message, 0)
    if (preflightHealth.status === 'offline') {
      throw new Error(
        preflightHealth.message ??
          `Cannot reach agent runtime at ${state.settings.runtime.sidecarBaseUrl}. Start the sidecar with \`npm run dev:all\` (\`npm run dev:all:hf\` for remote mode) or \`npm run dev:sidecar\`.`,
      )
    }

    const created = await createRun({
      threadId,
      mode,
      prompt,
      history: baseMessages,
      provider: state.settings.provider,
      runConfig: state.settings.runtime.runConfig,
      sidecarBaseUrl: state.settings.runtime.sidecarBaseUrl,
      providerKeys: {
        tavilyApiKey: state.settings.runtime.providerKeys.tavilyApiKey,
        braveApiKey: state.settings.runtime.providerKeys.braveApiKey,
      },
    })

    const runId = created.runId

    set((current) => ({
      ...current,
      activeRunIdByThread: {
        ...current.activeRunIdByThread,
        [threadId]: runId,
      },
      runsById: {
        ...current.runsById,
        [runId]: buildEmptyRun(runId, threadId, mode, prompt),
      },
    }))

    const seenEventIds = new Set<number>()
    let lastEventId = 0
    let reconnectCount = 0

    const consumeEvent = (event: RunTimelineEvent): void => {
      if (event.id > 0) {
        if (seenEventIds.has(event.id)) {
          return
        }
        seenEventIds.add(event.id)
        lastEventId = Math.max(lastEventId, event.id)
      }

      appendTimelineEvent(threadId, event)

      set((current) => {
        const run = current.runsById[runId] ?? buildEmptyRun(runId, threadId, mode, prompt)
        const nextRun: AgentRunRecord = {
          ...run,
          updatedAt: nowIso(),
          timeline: [...run.timeline, event].sort((a, b) => a.id - b.id),
        }

        if (event.event === 'citation.added') {
          nextRun.citations = [
            ...nextRun.citations,
            {
              sourceId: String(event.payload.sourceId ?? `S${nextRun.citations.length + 1}`),
              url: String(event.payload.url ?? ''),
              title: String(event.payload.title ?? 'Source'),
              snippet: String(event.payload.snippet ?? ''),
              claimRef: String(event.payload.claimRef ?? ''),
              confidence:
                typeof event.payload.confidence === 'number'
                  ? event.payload.confidence
                  : 0.5,
            },
          ]
        }

        if (event.event === 'run.failed') {
          nextRun.status = 'failed'
          nextRun.error = String(event.payload.message ?? 'Run failed.')
        }

        if (event.event === 'run.completed') {
          nextRun.status = 'completed'
        }

        if (event.event === 'run.cancelled') {
          nextRun.status = 'cancelled'
        }

        return {
          ...current,
          runsById: {
            ...current.runsById,
            [runId]: nextRun,
          },
        }
      })

      if (event.event === 'draft.delta') {
        const delta = typeof event.payload.delta === 'string' ? event.payload.delta : ''
        if (!delta) {
          return
        }

        set((current) => ({
          ...current,
          messagesByThread: replaceMessage(
            current.messagesByThread,
            threadId,
            assistantMessageId,
            (message) => ({
              ...message,
              content: message.content + delta,
            }),
          ),
        }))

        const currentAssistant =
          get()
            .messagesByThread[threadId]
            ?.find((message) => message.id === assistantMessageId)
            ?.content ?? ''

        void db.messages.update(assistantMessageId, {
          content: currentAssistant,
        })
      }
    }

    let streamError: Error | null = null

    try {
      const streamResult = await streamRun({
        runId,
        sidecarBaseUrl: state.settings.runtime.sidecarBaseUrl,
        signal: streamController.signal,
        afterId: lastEventId,
        maxReconnects: 5,
        onEvent: consumeEvent,
      })

      reconnectCount = streamResult.reconnectCount
      applyRuntimeHealth('online', null, reconnectCount)
    } catch (error) {
      streamError = asError(error, 'Stream connection failed.')
      const runtimeError = error instanceof RuntimeTransportError ? error : null

      applyRuntimeHealth(
        runtimeError?.code === 'network_unreachable' ? 'offline' : 'degraded',
        streamError.message,
        reconnectCount,
      )
    }

    let runResponse: Awaited<ReturnType<typeof getRun>> | null = null
    let runLookupError: Error | null = null
    const maxAttempts = streamError ? 1 : 2

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        runResponse = await getRun(state.settings.runtime.sidecarBaseUrl, runId)
        runLookupError = null

        const status = runResponse.run.status
        const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled'

        if (isTerminal || !streamError) {
          break
        }
      } catch (error) {
        runLookupError = asError(error, 'Failed to fetch run state.')
      }

      if (attempt < maxAttempts - 1) {
        await wait(350 * (attempt + 1))
      }
    }

    if (!runResponse && streamError) {
      const recoveryDeadline = Date.now() + 30000

      while (Date.now() < recoveryDeadline && !streamController.signal.aborted) {
        try {
          const incrementalEvents = await getRunEventsSince(
            state.settings.runtime.sidecarBaseUrl,
            runId,
            lastEventId,
          )

          for (const event of incrementalEvents) {
            consumeEvent(event)
          }

          runResponse = await getRun(state.settings.runtime.sidecarBaseUrl, runId)
          runLookupError = null

          const status = runResponse.run.status
          const isTerminal =
            status === 'completed' || status === 'failed' || status === 'cancelled'
          if (isTerminal) {
            break
          }
        } catch (error) {
          runLookupError = asError(error, 'Failed to recover run state after stream interruption.')
        }

        await wait(1000)
      }
    }

    if (!runResponse) {
      throw runLookupError ?? streamError ?? new Error('Failed to fetch run state.')
    }

    {
      if (streamError) {
        applyRuntimeHealth('online', null, reconnectCount)
      }

      const finalRun: AgentRunRecord = {
        ...runResponse.run,
        timeline: runResponse.events,
      }

      const currentAssistant =
        get()
          .messagesByThread[threadId]
          ?.find((message) => message.id === assistantMessageId)

      const finalContent = finalRun.artifact.finalAnswer || currentAssistant?.content || ''
      const assistantStatus: ChatMessage['status'] =
        finalRun.status === 'completed'
          ? 'complete'
          : finalRun.status === 'cancelled' && finalContent
            ? 'complete'
            : 'error'

      const assistantError =
        finalRun.status === 'failed'
          ? finalRun.error ?? 'Agent run failed.'
          : finalRun.status === 'cancelled'
            ? finalContent
              ? undefined
              : 'Run cancelled.'
            : undefined

      const finalizedMessage: ChatMessage = {
        ...(currentAssistant ?? {
          id: assistantMessageId,
          threadId,
          role: 'assistant',
          content: finalContent,
          createdAt: nowIso(),
          status: 'streaming',
        }),
        content: finalContent,
        status: assistantStatus,
        error: assistantError,
      }

      const currentThread = get().threads.find((thread) => thread.id === threadId)
      const renamedThread = currentThread
        ? {
            ...currentThread,
            updatedAt: nowIso(),
            title:
              titlePrompt && isDefaultThreadTitle(currentThread.title)
                ? buildTitleFromPrompt(titlePrompt)
                : currentThread.title,
          }
        : null

      set((current) => {
        const mergedTimeline = [...(current.timelineByThread[threadId] ?? []), ...finalRun.timeline]
          .sort((a, b) => a.id - b.id)
          .filter((event, index, list) => index === 0 || event.id !== list[index - 1]?.id)

        return {
          ...current,
          sending: false,
          streamController: null,
          banner:
            finalRun.status === 'failed'
              ? {
                  type: 'error',
                  message: finalRun.error ?? 'Agent run failed.',
                }
              : current.banner,
          activeRunIdByThread: {
            ...current.activeRunIdByThread,
            [threadId]: null,
          },
          runsById: {
            ...current.runsById,
            [runId]: finalRun,
          },
          timelineByThread: {
            ...current.timelineByThread,
            [threadId]: mergedTimeline,
          },
          threads:
            renamedThread !== null
              ? sortThreads(replaceThread(current.threads, renamedThread))
              : current.threads,
          messagesByThread: replaceMessage(
            current.messagesByThread,
            threadId,
            assistantMessageId,
            () => finalizedMessage,
          ),
        }
      })

      await db.transaction('rw', db.messages, db.runs, db.threads, async () => {
        await db.messages.put(finalizedMessage)
        await db.runs.put(finalRun)
        if (renamedThread) {
          await db.threads.put(renamedThread)
        }
      })

      await persistCurrentRun(runId)

      const isTerminal =
        finalRun.status === 'completed' || finalRun.status === 'failed' || finalRun.status === 'cancelled'

      if (streamError && !isTerminal) {
        throw streamError
      }
    }
  }

  return {
    initialized: false,
    initializing: false,
    sending: false,
    streamController: null,
    threads: [],
    messagesByThread: {},
    activeThreadId: null,
    settings: DEFAULT_SETTINGS,
    settingsOpen: false,
    mobileSidebarOpen: false,
    citationsDrawerOpen: false,
    searchQuery: '',
    banner: null,
    activeMode: DEFAULT_SETTINGS.runtime.defaultMode,
    timelineByThread: {},
    runsById: {},
    activeRunIdByThread: {},
    benchmarkReport: null,
    benchmarkLoading: false,
    runtimeHealth: 'offline',
    runtimeHealthMessage: null,
    runtimeReconnectAttempts: 0,

    initialize: async () => {
      if (get().initialized || get().initializing) {
        return
      }

      set((state) => ({ ...state, initializing: true }))

      try {
        const persistedSettings = await db.settings.get('app')
        const normalizedSettings = normalizeSettings(persistedSettings?.value ?? DEFAULT_SETTINGS)
        const settings =
          normalizedSettings.runtime.defaultMode === 'chat'
            ? normalizedSettings
            : normalizeSettings({
                ...normalizedSettings,
                runtime: {
                  ...normalizedSettings.runtime,
                  defaultMode: 'chat',
                },
              })

        if (!persistedSettings || settings.runtime.defaultMode !== normalizedSettings.runtime.defaultMode) {
          await persistSettings(settings)
        }

        let threads = sortThreads(await db.threads.toArray())

        if (threads.length === 0) {
          const newThread = buildNewThread(settings.provider.model)
          threads = [newThread]
          await db.threads.put(newThread)
        }

        const messages = await db.messages.toArray()
        const runs = await db.runs.toArray()
        const runsById = Object.fromEntries(runs.map((run) => [run.id, run]))
        const timelineEvents = runs.flatMap((run) => run.timeline)

        set((state) => ({
          ...state,
          initialized: true,
          initializing: false,
          settings,
          activeMode: settings.runtime.defaultMode,
          threads,
          messagesByThread: groupMessages(messages),
          activeThreadId: threads[0]?.id ?? null,
          runsById,
          timelineByThread: groupTimeline(timelineEvents, runsById),
          banner: null,
        }))

        try {
          const latest = await getLatestBenchmark(settings.runtime.sidecarBaseUrl)
          if (latest) {
            set((state) => ({ ...state, benchmarkReport: latest }))
          }
        } catch {
          // Ignore benchmark bootstrap failures in offline mode.
        }

        await get().checkRuntimeHealth()
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to initialize storage. Check IndexedDB permissions.'

        const fallbackThread = buildNewThread(DEFAULT_SETTINGS.provider.model)

        set((state) => ({
          ...state,
          initialized: true,
          initializing: false,
          settings: DEFAULT_SETTINGS,
          activeMode: DEFAULT_SETTINGS.runtime.defaultMode,
          threads: [fallbackThread],
          activeThreadId: fallbackThread.id,
          messagesByThread: {},
          banner: {
            type: 'error',
            message,
          },
          runtimeHealth: 'offline',
          runtimeHealthMessage: message,
        }))
      }
    },

    createThread: async () => {
      const model = get().settings.provider.model
      const thread = buildNewThread(model)

      set((state) => ({
        ...state,
        threads: sortThreads([thread, ...state.threads]),
        activeThreadId: thread.id,
        mobileSidebarOpen: false,
        messagesByThread: {
          ...state.messagesByThread,
          [thread.id]: [],
        },
      }))

      await db.threads.put(thread)
    },

    setActiveThread: (threadId) => {
      set((state) => ({
        ...state,
        activeThreadId: threadId,
        mobileSidebarOpen: false,
      }))
    },

    renameThread: async (threadId, title) => {
      const nextTitle = title.trim() || 'New Chat'
      const existing = get().threads.find((thread) => thread.id === threadId)
      if (!existing) {
        return
      }

      const renamed: ChatThread = {
        ...existing,
        title: nextTitle,
        updatedAt: nowIso(),
      }

      set((state) => ({
        ...state,
        threads: sortThreads(replaceThread(state.threads, renamed)),
      }))

      await db.threads.put(renamed)
    },

    deleteThread: async (threadId) => {
      const state = get()
      const nextThreads = state.threads.filter((thread) => thread.id !== threadId)
      const nextMessagesByThread = { ...state.messagesByThread }
      delete nextMessagesByThread[threadId]

      const nextTimeline = { ...state.timelineByThread }
      delete nextTimeline[threadId]

      const runIdsToDelete = Object.values(state.runsById)
        .filter((run) => run.threadId === threadId)
        .map((run) => run.id)

      const nextRunsById = { ...state.runsById }
      for (const runId of runIdsToDelete) {
        delete nextRunsById[runId]
      }

      const nextActive =
        state.activeThreadId === threadId ? (nextThreads[0]?.id ?? null) : state.activeThreadId

      set((current) => ({
        ...current,
        threads: nextThreads,
        messagesByThread: nextMessagesByThread,
        activeThreadId: nextActive,
        timelineByThread: nextTimeline,
        runsById: nextRunsById,
      }))

      await db.transaction('rw', db.threads, db.messages, db.runs, async () => {
        await db.threads.delete(threadId)
        await db.messages.where('threadId').equals(threadId).delete()
        await db.runs.where('threadId').equals(threadId).delete()
      })

      if (nextThreads.length === 0) {
        await get().createThread()
      }
    },

    setSearchQuery: (query) => {
      set((state) => ({ ...state, searchQuery: query }))
    },

    setSettingsOpen: (open) => {
      set((state) => ({ ...state, settingsOpen: open }))
    },

    setMobileSidebarOpen: (open) => {
      set((state) => ({ ...state, mobileSidebarOpen: open }))
    },

    setCitationsDrawerOpen: (open) => {
      set((state) => ({ ...state, citationsDrawerOpen: open }))
    },

    setActiveMode: async (mode) => {
      void mode
      const state = get()
      const nextMode: ModeType = 'chat'
      const settings: AppSettings = normalizeSettings({
        ...state.settings,
        runtime: {
          ...state.settings.runtime,
          defaultMode: nextMode,
        },
      })

      set((current) => ({
        ...current,
        activeMode: nextMode,
        settings,
      }))

      await persistSettings(settings)
    },

    updateProvider: async (update) => {
      const state = get()
      const settings: AppSettings = normalizeSettings({
        ...state.settings,
        provider: {
          ...state.settings.provider,
          ...update,
          stream: true,
        },
      })

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)
    },

    updateUiDensity: async (density) => {
      const state = get()
      const settings: AppSettings = normalizeSettings({
        ...state.settings,
        uiDensity: density,
      })

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)
    },

    updateSidecarBaseUrl: async (baseUrl) => {
      const state = get()
      const settings = normalizeSettings({
        ...state.settings,
        runtime: {
          ...state.settings.runtime,
          sidecarBaseUrl: baseUrl,
        },
      })

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)
      await get().checkRuntimeHealth()
    },

    updateRunConfig: async (update) => {
      const state = get()
      const settings = normalizeSettings({
        ...state.settings,
        runtime: {
          ...state.settings.runtime,
          runConfig: {
            ...state.settings.runtime.runConfig,
            ...update,
          },
        },
      })

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)
    },

    updateProviderKeys: async (update) => {
      const state = get()
      const settings = normalizeSettings({
        ...state.settings,
        runtime: {
          ...state.settings.runtime,
          providerKeys: {
            ...state.settings.runtime.providerKeys,
            ...update,
          },
        },
      })

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)

      try {
        await saveProviderKeys(settings.runtime.sidecarBaseUrl, settings.runtime.providerKeys)
      } catch (error) {
        set((current) => ({
          ...current,
          banner: {
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to store provider keys in sidecar runtime.',
          },
        }))
      }
    },

    clearBanner: () => {
      set((state) => ({ ...state, banner: null }))
    },

    checkRuntimeHealth: async () => {
      const sidecarBaseUrl = get().settings.runtime.sidecarBaseUrl

      try {
        const health = await getRuntimeHealth(sidecarBaseUrl)

        if (health.status === 'online') {
          applyRuntimeHealth('online', null, 0)
          return
        }

        if (health.status === 'degraded') {
          applyRuntimeHealth(
            'degraded',
            health.message ?? 'Agent runtime is reachable but operating in degraded mode.',
            0,
          )
          return
        }

        applyRuntimeHealth(
          'offline',
          health.message ??
            `Cannot reach agent runtime at ${sidecarBaseUrl}. Start the sidecar with \`npm run dev:all\` (\`npm run dev:all:hf\` for remote mode) or \`npm run dev:sidecar\`.`,
          0,
        )
      } catch (error) {
        applyRuntimeHealth(
          'offline',
          error instanceof Error
            ? error.message
            : `Cannot reach agent runtime at ${sidecarBaseUrl}. Start the sidecar with \`npm run dev:all\` (\`npm run dev:all:hf\` for remote mode) or \`npm run dev:sidecar\`.`,
          0,
        )
      }
    },

    sendMessage: async (prompt) => {
      const trimmedPrompt = prompt.trim()
      if (!trimmedPrompt || get().sending) {
        return
      }

      let threadId = get().activeThreadId
      if (!threadId) {
        await get().createThread()
        threadId = get().activeThreadId
      }

      if (!threadId) {
        return
      }

      const currentState = get()
      const existingMessages = currentState.messagesByThread[threadId] ?? []
      const baseThread = currentState.threads.find((thread) => thread.id === threadId)

      if (!baseThread) {
        return
      }

      const userMessage: ChatMessage = {
        id: makeId(),
        threadId,
        role: 'user',
        content: trimmedPrompt,
        createdAt: nowIso(),
        status: 'complete',
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        threadId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
        status: 'streaming',
      }

      const updatedThread: ChatThread = {
        ...baseThread,
        updatedAt: nowIso(),
        model: currentState.settings.provider.model,
      }

      const nextMessages = [...existingMessages, userMessage, assistantMessage]
      const requestMessages = [...existingMessages, userMessage]
      const userMessagesInThread = requestMessages.filter((message) => message.role === 'user')
      const assistantMessagesInThread = existingMessages.filter((message) => message.role === 'assistant')
      const isFirstAssistantTurn = userMessagesInThread.length === 1 && assistantMessagesInThread.length === 0

      set((state) => ({
        ...state,
        banner: null,
        mobileSidebarOpen: false,
        threads: sortThreads(replaceThread(state.threads, updatedThread)),
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: nextMessages,
        },
      }))

      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.put(updatedThread)
        await db.messages.put(userMessage)
        await db.messages.put(assistantMessage)
      })

      const shouldAutoTitle =
        isDefaultThreadTitle(updatedThread.title) &&
        existingMessages.filter((message) => message.role === 'user').length === 0

      if (get().activeMode === 'chat') {
        const modelMessages = await buildMessagesWithAgentBrain({
          messages: requestMessages,
          threadId,
          isFirstAssistantTurn,
        })

        await streamAssistantDirect({
          threadId,
          requestMessages: modelMessages,
          assistantMessageId: assistantMessage.id,
          titlePrompt: shouldAutoTitle ? trimmedPrompt : undefined,
        })
        return
      }

      try {
        await streamAssistantAdvanced({
          threadId,
          prompt: trimmedPrompt,
          baseMessages: requestMessages,
          assistantMessageId: assistantMessage.id,
          mode: get().activeMode,
          titlePrompt: shouldAutoTitle ? trimmedPrompt : undefined,
        })
      } catch (error) {
        const fallbackMessage =
          error instanceof Error && error.message
            ? error.message
            : 'Advanced run failed before completion.'

        set((state) => ({
          ...state,
          sending: false,
          streamController: null,
          banner: {
            type: 'error',
            message: fallbackMessage,
          },
          messagesByThread: replaceMessage(
            state.messagesByThread,
            threadId,
            assistantMessage.id,
            (message) => ({
              ...message,
              status: 'error',
              error: fallbackMessage,
            }),
          ),
        }))

        await db.messages.update(assistantMessage.id, {
          status: 'error',
          error: fallbackMessage,
        })
      }
    },

    stopStreaming: () => {
      const state = get()
      const controller = state.streamController
      const activeThreadId = state.activeThreadId
      const runId = activeThreadId ? state.activeRunIdByThread[activeThreadId] : null

      if (runId && activeThreadId) {
        void cancelRun(state.settings.runtime.sidecarBaseUrl, runId)
      }

      if (controller) {
        controller.abort()
      }
    },

    regenerateLastResponse: async () => {
      if (get().sending) {
        return
      }

      const threadId = get().activeThreadId
      if (!threadId) {
        return
      }

      const messages = get().messagesByThread[threadId] ?? []
      if (messages.length === 0) {
        return
      }

      let contextMessages = messages
      const lastMessage = contextMessages[contextMessages.length - 1]

      if (lastMessage?.role === 'assistant') {
        contextMessages = contextMessages.slice(0, -1)

        set((state) => ({
          ...state,
          messagesByThread: {
            ...state.messagesByThread,
            [threadId]: contextMessages,
          },
        }))

        await db.messages.delete(lastMessage.id)
      }

      const latestUser = [...contextMessages].reverse().find((message) => message.role === 'user')
      if (!latestUser) {
        set((state) => ({
          ...state,
          banner: {
            type: 'info',
            message: 'Add a user prompt before regenerating.',
          },
        }))
        return
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        threadId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
        status: 'streaming',
      }

      const requestMessages = [...contextMessages]
      const nextMessages = [...contextMessages, assistantMessage]
      const userMessagesInThread = requestMessages.filter((message) => message.role === 'user')
      const assistantMessagesInThread = contextMessages.filter(
        (message) => message.role === 'assistant',
      )
      const isFirstAssistantTurn = userMessagesInThread.length === 1 && assistantMessagesInThread.length === 0

      set((state) => ({
        ...state,
        messagesByThread: {
          ...state.messagesByThread,
          [threadId]: nextMessages,
        },
      }))

      await db.messages.put(assistantMessage)

      if (get().activeMode === 'chat') {
        const modelMessages = await buildMessagesWithAgentBrain({
          messages: requestMessages,
          threadId,
          isFirstAssistantTurn,
        })

        await streamAssistantDirect({
          threadId,
          requestMessages: modelMessages,
          assistantMessageId: assistantMessage.id,
        })
        return
      }

      try {
        await streamAssistantAdvanced({
          threadId,
          prompt: latestUser.content,
          baseMessages: requestMessages,
          assistantMessageId: assistantMessage.id,
          mode: get().activeMode,
        })
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to regenerate response in advanced mode.'

        set((state) => ({
          ...state,
          sending: false,
          streamController: null,
          banner: {
            type: 'error',
            message,
          },
          messagesByThread: replaceMessage(
            state.messagesByThread,
            threadId,
            assistantMessage.id,
            (entry) => ({
              ...entry,
              status: 'error',
              error: message,
            }),
          ),
        }))

        await db.messages.update(assistantMessage.id, {
          status: 'error',
          error: message,
        })
      }
    },

    exportChats: async () => {
      const threads = await db.threads.toArray()
      const messages = await db.messages.toArray()
      const runs = await db.runs.toArray()
      const settingsRecord = await db.settings.get('app')
      const settings = normalizeSettings(settingsRecord?.value ?? get().settings)

      const bundle = createExportBundle(
        sortThreads(threads),
        messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        settings,
        runs,
      )

      return serializeExportBundle(bundle)
    },

    importChatsFromText: async (raw) => {
      const bundle = parseExportBundle(raw)
      const normalizedSettings = normalizeSettings(bundle.settings)
      const importedSettings =
        normalizedSettings.runtime.defaultMode === 'chat'
          ? normalizedSettings
          : normalizeSettings({
              ...normalizedSettings,
              runtime: {
                ...normalizedSettings.runtime,
                defaultMode: 'chat',
              },
            })

      await db.transaction('rw', db.threads, db.messages, db.settings, db.runs, async () => {
        await db.threads.clear()
        await db.messages.clear()
        await db.settings.clear()
        await db.runs.clear()

        await db.threads.bulkPut(bundle.threads)
        await db.messages.bulkPut(bundle.messages)
        await db.settings.put({
          key: 'app',
          value: importedSettings,
        })

        if (bundle.runs && bundle.runs.length > 0) {
          await db.runs.bulkPut(bundle.runs)
        }
      })

      const threads = sortThreads(bundle.threads)
      const messagesByThread = groupMessages(bundle.messages)
      const runs = bundle.runs ?? []
      const runsById = Object.fromEntries(runs.map((run) => [run.id, run]))
      const timelineByThread = groupTimeline(
        runs.flatMap((run) => run.timeline),
        runsById,
      )

      set((state) => ({
        ...state,
        threads,
        messagesByThread,
        runsById,
        timelineByThread,
        settings: importedSettings,
        activeMode: 'chat',
        activeThreadId: threads[0]?.id ?? null,
        banner: {
          type: 'info',
          message: 'Import complete.',
        },
      }))

      if (threads.length === 0) {
        await get().createThread()
      }
    },

    clearAllChats: async () => {
      const settings = get().settings
      await db.transaction('rw', db.threads, db.messages, db.runs, async () => {
        await db.threads.clear()
        await db.messages.clear()
        await db.runs.clear()
      })

      const newThread = buildNewThread(settings.provider.model)
      await db.threads.put(newThread)

      set((state) => ({
        ...state,
        threads: [newThread],
        messagesByThread: {
          [newThread.id]: [],
        },
        runsById: {},
        timelineByThread: {},
        activeThreadId: newThread.id,
        banner: {
          type: 'info',
          message: 'All chats cleared.',
        },
      }))
    },

    runBenchmarks: async () => {
      const state = get()
      set((current) => ({ ...current, benchmarkLoading: true }))

      try {
        const report = await runBenchmark(state.settings.runtime.sidecarBaseUrl)
        set((current) => ({
          ...current,
          benchmarkReport: report,
          benchmarkLoading: false,
          banner: {
            type: report.gatePassed ? 'info' : 'error',
            message: report.gatePassed
              ? 'Benchmark gate passed.'
              : 'Benchmark gate failed. Review per-mode metrics in settings.',
          },
        }))
      } catch (error) {
        set((current) => ({
          ...current,
          benchmarkLoading: false,
          banner: {
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to run benchmark suite against sidecar runtime.',
          },
        }))
      }
    },

    refreshBenchmark: async () => {
      const sidecarBaseUrl = get().settings.runtime.sidecarBaseUrl
      set((state) => ({ ...state, benchmarkLoading: true }))

      try {
        const report = await getLatestBenchmark(sidecarBaseUrl)

        set((state) => ({
          ...state,
          benchmarkLoading: false,
          benchmarkReport: report,
        }))
      } catch (error) {
        set((state) => ({
          ...state,
          benchmarkLoading: false,
          banner: {
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to load latest benchmark report.',
          },
        }))
      }
    },
  }
})
