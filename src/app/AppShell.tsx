import { useEffect, useMemo } from 'react'
import { Menu, Settings2, X } from 'lucide-react'

import { Composer } from '../features/chat/Composer'
import { MessageList } from '../features/chat/MessageList'
import { ThreadSidebar } from '../features/chat/ThreadSidebar'
import { SettingsDrawer } from '../features/settings/SettingsDrawer'
import { useChatStore } from '../store/useChatStore'

export function AppShell() {
  const {
    initialized,
    initializing,
    sending,
    threads,
    activeThreadId,
    messagesByThread,
    settings,
    settingsOpen,
    mobileSidebarOpen,
    searchQuery,
    banner,
    benchmarkReport,
    benchmarkLoading,
    accessGateUnlocked,
    accessGateWaitingForCode,
    initialize,
    createThread,
    setActiveThread,
    renameThread,
    deleteThread,
    setSearchQuery,
    setSettingsOpen,
    setMobileSidebarOpen,
    updateProvider,
    updateUiDensity,
    updateSidecarBaseUrl,
    updateProviderKeys,
    clearBanner,
    sendMessage,
    stopStreaming,
    regenerateLastResponse,
    exportChats,
    importChatsFromText,
    clearAllChats,
    runBenchmarks,
    refreshBenchmark,
  } = useChatStore()

  const activeMessages = useMemo(() => {
    if (!activeThreadId) {
      return []
    }

    return messagesByThread[activeThreadId] ?? []
  }, [activeThreadId, messagesByThread])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  )

  const canRegenerate = useMemo(
    () => activeMessages.some((message) => message.role === 'user'),
    [activeMessages],
  )

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) {
        if (event.key === 'Escape') {
          setSettingsOpen(false)
          setMobileSidebarOpen(false)
        }
        return
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void createThread()
      }

      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createThread, setMobileSidebarOpen, setSettingsOpen])

  const handleExport = async (): Promise<void> => {
    const payload = await exportChats()
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `qwen-chat-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File): Promise<void> => {
    const content = await file.text()
    await importChatsFromText(content)
  }

  return (
    <div className={`density-${settings.uiDensity} app-frame relative flex h-full overflow-hidden`}>
      <ThreadSidebar
        activeThreadId={activeThreadId}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onCreateThread={() => {
          void createThread()
        }}
        onDeleteThread={(threadId) => {
          void deleteThread(threadId)
        }}
        onRenameThread={(threadId, title) => {
          void renameThread(threadId, title)
        }}
        onSearchQueryChange={setSearchQuery}
        onSelectThread={setActiveThread}
        searchQuery={searchQuery}
        threads={threads}
      />

      <main className="relative z-0 flex h-full min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--surface-stroke)] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open sidebar"
              className="rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)] md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              type="button"
            >
              <Menu size={16} />
            </button>

            <div>
              <p className="font-serif text-xl tracking-tight text-[var(--text-primary)]">
                {activeThread?.title ?? 'Qwen Workspace'}
              </p>
              <p className="text-xs text-[var(--text-dim)]">
                {accessGateWaitingForCode && !accessGateUnlocked
                  ? 'Access locked - enter secret code to continue'
                  : `Chat - ${settings.provider.model} @ ${settings.provider.baseUrl}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {banner ? (
              <div className="hidden items-center gap-2 rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs text-[var(--text-muted)] sm:flex">
                <span>{banner.message}</span>
                <button
                  aria-label="Dismiss"
                  className="rounded p-0.5 transition hover:bg-black/5"
                  onClick={clearBanner}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}

            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              <Settings2 size={15} />
              Settings
            </button>
          </div>
        </header>

        {!initialized || initializing ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-2xl border border-[var(--surface-stroke)] bg-white px-5 py-3 text-sm text-[var(--text-muted)] shadow-sm">
              Initializing local workspace...
            </div>
          </div>
        ) : (
          <>
            {banner ? (
              <div className="border-b border-[var(--surface-stroke)] px-4 py-2 text-sm text-[var(--text-muted)] sm:hidden">
                {banner.message}
              </div>
            ) : null}

            <MessageList
              messages={activeMessages}
              onRegenerate={() => {
                void regenerateLastResponse()
              }}
              sending={sending}
            />

            <Composer
              canRegenerate={canRegenerate && accessGateUnlocked}
              disabled={!initialized}
              helperText={
                accessGateWaitingForCode && !accessGateUnlocked
                  ? 'Access gate active: enter the secret code and press Enter.'
                  : 'Enter to send - Shift+Enter for newline - Cmd/Ctrl+, settings'
              }
              onRegenerate={() => {
                void regenerateLastResponse()
              }}
              onSend={(prompt) => {
                void sendMessage(prompt)
              }}
              onStop={stopStreaming}
              placeholder={
                accessGateWaitingForCode && !accessGateUnlocked
                  ? 'Enter secret code to unlock chat...'
                  : 'Message Qwen...'
              }
              sending={sending}
            />
          </>
        )}
      </main>

      <SettingsDrawer
        benchmarkLoading={benchmarkLoading}
        benchmarkReport={benchmarkReport}
        onClearAll={() => clearAllChats()}
        onClose={() => setSettingsOpen(false)}
        onDensityChange={(density) => updateUiDensity(density)}
        onExport={handleExport}
        onImport={handleImport}
        onProviderChange={(update) => updateProvider(update)}
        onProviderKeysChange={(update) => updateProviderKeys(update)}
        onRefreshBenchmark={() => refreshBenchmark()}
        onRunBenchmarks={() => runBenchmarks()}
        onSidecarBaseUrlChange={(baseUrl) => updateSidecarBaseUrl(baseUrl)}
        open={settingsOpen}
        settings={settings}
      />
    </div>
  )
}
