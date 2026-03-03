import { create } from 'zustand'

import { streamChatCompletion, type ChatCompletionMessage } from '../lib/api/openaiClient'
import { createExportBundle, parseExportBundle, serializeExportBundle } from '../lib/exportImport'
import { buildTitleFromPrompt, isDefaultThreadTitle } from '../lib/chat/title'
import { db } from '../lib/storage/db'
import { normalizeSettings } from '../lib/storage/migrations'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ChatMessage,
  type ChatThread,
  type ProviderConfig,
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
  searchQuery: string
  banner: Banner | null
  initialize: () => Promise<void>
  createThread: () => Promise<void>
  setActiveThread: (threadId: string) => void
  renameThread: (threadId: string, title: string) => Promise<void>
  deleteThread: (threadId: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setSettingsOpen: (open: boolean) => void
  setMobileSidebarOpen: (open: boolean) => void
  updateProvider: (update: Partial<ProviderConfig>) => Promise<void>
  updateUiDensity: (density: UiDensity) => Promise<void>
  clearBanner: () => void
  sendMessage: (prompt: string) => Promise<void>
  stopStreaming: () => void
  regenerateLastResponse: () => Promise<void>
  exportChats: () => Promise<string>
  importChatsFromText: (raw: string) => Promise<void>
  clearAllChats: () => Promise<void>
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

function toApiMessages(messages: ChatMessage[]): ChatCompletionMessage[] {
  return messages
    .filter((message) => message.role === 'system' || message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
}

async function persistSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ key: 'app', value: normalizeSettings(settings) })
}

export const useChatStore = create<ChatState>((set, get) => {
  const streamAssistant = async ({
    threadId,
    baseMessages,
    titlePrompt,
  }: {
    threadId: string
    baseMessages: ChatMessage[]
    titlePrompt?: string
  }): Promise<void> => {
    const state = get()
    const activeThread = state.threads.find((thread) => thread.id === threadId)
    if (!activeThread) {
      return
    }

    const streamController = new AbortController()
    const assistantMessage: ChatMessage = {
      id: makeId(),
      threadId,
      role: 'assistant',
      content: '',
      createdAt: nowIso(),
      status: 'streaming',
    }

    const updatedThread: ChatThread = {
      ...activeThread,
      updatedAt: nowIso(),
      model: state.settings.provider.model,
    }

    set((current) => ({
      ...current,
      sending: true,
      streamController,
      banner: null,
      threads: sortThreads(replaceThread(current.threads, updatedThread)),
      messagesByThread: {
        ...current.messagesByThread,
        [threadId]: [...(current.messagesByThread[threadId] ?? []), assistantMessage],
      },
    }))

    await db.transaction('rw', db.threads, db.messages, async () => {
      await db.threads.put(updatedThread)
      await db.messages.put(assistantMessage)
    })

    try {
      await streamChatCompletion({
        config: state.settings.provider,
        messages: toApiMessages(baseMessages),
        signal: streamController.signal,
        onDelta: (delta) => {
          set((current) => ({
            ...current,
            messagesByThread: replaceMessage(
              current.messagesByThread,
              threadId,
              assistantMessage.id,
              (message) => ({ ...message, content: message.content + delta }),
            ),
          }))

          const currentAssistant =
            get()
              .messagesByThread[threadId]
              ?.find((message) => message.id === assistantMessage.id)
              ?.content ?? ''

          void db.messages.update(assistantMessage.id, {
            content: currentAssistant,
          })
        },
      })

      const finalAssistant =
        get()
          .messagesByThread[threadId]
          ?.find((message) => message.id === assistantMessage.id) ?? assistantMessage

      const hasContent = finalAssistant.content.trim().length > 0
      const completeAssistant: ChatMessage = {
        ...finalAssistant,
        status: hasContent ? 'complete' : 'error',
        error: hasContent ? undefined : 'Model returned an empty response.',
      }

      const currentThread = get().threads.find((thread) => thread.id === threadId) ?? updatedThread
      const renamedThread: ChatThread = {
        ...currentThread,
        updatedAt: nowIso(),
        title:
          titlePrompt && isDefaultThreadTitle(currentThread.title)
            ? buildTitleFromPrompt(titlePrompt)
            : currentThread.title,
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
          assistantMessage.id,
          () => completeAssistant,
        ),
      }))

      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.put(renamedThread)
        await db.messages.put(completeAssistant)
      })
    } catch (error) {
      const isAbort = streamController.signal.aborted
      const currentAssistant =
        get()
          .messagesByThread[threadId]
          ?.find((message) => message.id === assistantMessage.id) ?? assistantMessage

      const hasContent = currentAssistant.content.trim().length > 0
      const fallbackError =
        error instanceof Error && error.message ? error.message : 'Failed to generate response.'

      const erroredAssistant: ChatMessage = {
        ...currentAssistant,
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
          assistantMessage.id,
          () => erroredAssistant,
        ),
      }))

      await db.messages.put(erroredAssistant)
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
    searchQuery: '',
    banner: null,

    initialize: async () => {
      if (get().initialized || get().initializing) {
        return
      }

      set((state) => ({ ...state, initializing: true }))

      try {
        const persistedSettings = await db.settings.get('app')
        const settings = normalizeSettings(persistedSettings?.value ?? DEFAULT_SETTINGS)

        if (!persistedSettings) {
          await persistSettings(settings)
        }

        let threads = sortThreads(await db.threads.toArray())

        if (threads.length === 0) {
          const newThread = buildNewThread(settings.provider.model)
          threads = [newThread]
          await db.threads.put(newThread)
        }

        const messages = await db.messages.toArray()

        set((state) => ({
          ...state,
          initialized: true,
          initializing: false,
          settings,
          threads,
          messagesByThread: groupMessages(messages),
          activeThreadId: threads[0]?.id ?? null,
          banner: null,
        }))
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
          threads: [fallbackThread],
          activeThreadId: fallbackThread.id,
          messagesByThread: {},
          banner: {
            type: 'error',
            message,
          },
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

      const nextActive =
        state.activeThreadId === threadId ? (nextThreads[0]?.id ?? null) : state.activeThreadId

      set((current) => ({
        ...current,
        threads: nextThreads,
        messagesByThread: nextMessagesByThread,
        activeThreadId: nextActive,
      }))

      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.delete(threadId)
        await db.messages.where('threadId').equals(threadId).delete()
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
      const settings: AppSettings = {
        ...state.settings,
        uiDensity: density,
      }

      set((current) => ({ ...current, settings }))
      await persistSettings(settings)
    },

    clearBanner: () => {
      set((state) => ({ ...state, banner: null }))
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

      const updatedThread: ChatThread = {
        ...baseThread,
        updatedAt: nowIso(),
        model: currentState.settings.provider.model,
      }

      const nextMessages = [...existingMessages, userMessage]

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
      })

      const shouldAutoTitle =
        isDefaultThreadTitle(updatedThread.title) &&
        existingMessages.filter((message) => message.role === 'user').length === 0

      await streamAssistant({
        threadId,
        baseMessages: nextMessages,
        titlePrompt: shouldAutoTitle ? trimmedPrompt : undefined,
      })
    },

    stopStreaming: () => {
      const controller = get().streamController
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

      await streamAssistant({
        threadId,
        baseMessages: contextMessages,
      })
    },

    exportChats: async () => {
      const threads = await db.threads.toArray()
      const messages = await db.messages.toArray()
      const settingsRecord = await db.settings.get('app')
      const settings = normalizeSettings(settingsRecord?.value ?? get().settings)

      const bundle = createExportBundle(
        sortThreads(threads),
        messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        settings,
      )

      return serializeExportBundle(bundle)
    },

    importChatsFromText: async (raw) => {
      const bundle = parseExportBundle(raw)

      await db.transaction('rw', db.threads, db.messages, db.settings, async () => {
        await db.threads.clear()
        await db.messages.clear()
        await db.settings.clear()

        await db.threads.bulkPut(bundle.threads)
        await db.messages.bulkPut(bundle.messages)
        await db.settings.put({
          key: 'app',
          value: normalizeSettings(bundle.settings),
        })
      })

      const threads = sortThreads(bundle.threads)
      const messagesByThread = groupMessages(bundle.messages)

      set((state) => ({
        ...state,
        threads,
        messagesByThread,
        settings: normalizeSettings(bundle.settings),
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
      await db.transaction('rw', db.threads, db.messages, async () => {
        await db.threads.clear()
        await db.messages.clear()
      })

      const newThread = buildNewThread(settings.provider.model)
      await db.threads.put(newThread)

      set((state) => ({
        ...state,
        threads: [newThread],
        messagesByThread: {
          [newThread.id]: [],
        },
        activeThreadId: newThread.id,
        banner: {
          type: 'info',
          message: 'All chats cleared.',
        },
      }))
    },
  }
})
