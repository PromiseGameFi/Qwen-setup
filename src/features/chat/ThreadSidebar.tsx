import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import clsx from 'clsx'

import type { ChatThread } from '../../types/chat'

interface ThreadSidebarProps {
  threads: ChatThread[]
  activeThreadId: string | null
  searchQuery: string
  mobileOpen: boolean
  onCloseMobile: () => void
  onSearchQueryChange: (query: string) => void
  onCreateThread: () => void
  onSelectThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onDeleteThread: (threadId: string) => void
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  searchQuery,
  mobileOpen,
  onCloseMobile,
  onSearchQueryChange,
  onCreateThread,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
}: ThreadSidebarProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return threads
    }

    return threads.filter((thread) => {
      const haystack = `${thread.title} ${thread.model}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [searchQuery, threads])

  const commitRename = (threadId: string): void => {
    const nextTitle = editingTitle.trim()
    if (nextTitle) {
      onRenameThread(threadId, nextTitle)
    }

    setEditingThreadId(null)
    setEditingTitle('')
  }

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-20 bg-black/35 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-[20.5rem] flex-col border-r border-white/10 bg-[var(--sidebar-bg)] p-4 text-[var(--sidebar-text)] shadow-2xl transition-transform md:static md:z-10 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-serif text-xl tracking-tight text-white">Conversations</p>
          <button
            aria-label="Close sidebar"
            className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white md:hidden"
            onClick={onCloseMobile}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <button
          className="mb-4 inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          onClick={onCreateThread}
          type="button"
        >
          <Plus size={16} />
          New Chat
        </button>

        <label className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <Search size={15} className="text-white/50" />
          <input
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search chats"
            value={searchQuery}
          />
        </label>

        <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto pr-1">
          {filteredThreads.map((thread) => {
            const isActive = thread.id === activeThreadId
            const isEditing = editingThreadId === thread.id

            return (
              <div
                className={clsx(
                  'group rounded-xl border px-3 py-2 transition',
                  isActive
                    ? 'border-white/30 bg-white/14'
                    : 'border-white/0 bg-white/4 hover:border-white/15 hover:bg-white/9',
                )}
                key={thread.id}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className="w-full rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-sm outline-none"
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitRename(thread.id)
                        }

                        if (event.key === 'Escape') {
                          setEditingThreadId(null)
                          setEditingTitle('')
                        }
                      }}
                      value={editingTitle}
                    />
                    <button
                      aria-label="Save title"
                      className="rounded-md p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                      onClick={() => commitRename(thread.id)}
                      type="button"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full text-left"
                    onClick={() => onSelectThread(thread.id)}
                    type="button"
                  >
                    <p className="truncate text-sm font-medium text-white">{thread.title}</p>
                    <p className="mt-1 truncate text-xs text-white/55">
                      {thread.model} - {formatTimestamp(thread.updatedAt)}
                    </p>
                  </button>
                )}

                {!isEditing && (
                  <div className="mt-2 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      aria-label="Rename thread"
                      className="rounded-md p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setEditingThreadId(thread.id)
                        setEditingTitle(thread.title)
                      }}
                      type="button"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Delete thread"
                      className="rounded-md p-1 text-white/60 transition hover:bg-red-500/20 hover:text-red-100"
                      onClick={() => {
                        const shouldDelete = window.confirm('Delete this chat permanently?')
                        if (shouldDelete) {
                          onDeleteThread(thread.id)
                        }
                      }}
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {filteredThreads.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-white/60">
              No chats match your search.
            </p>
          ) : null}
        </div>
      </aside>
    </>
  )
}
