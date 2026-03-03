import { useEffect, useMemo, useRef } from 'react'

import type { ChatMessage } from '../../types/chat'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: ChatMessage[]
  sending: boolean
  onRegenerate: () => void
}

function EmptyState() {
  return (
    <div className="mx-auto mt-16 max-w-2xl px-6 text-center">
      <p className="font-serif text-4xl tracking-tight text-[var(--text-primary)]">Qwen Workspace</p>
      <p className="mt-4 text-base leading-relaxed text-[var(--text-muted)]">
        Ask questions, iterate on code, and keep everything local. Your chat history is stored on
        this machine only.
      </p>
      <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-4">
          <p className="font-medium text-[var(--text-primary)]">Try prompting with context</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            "Summarize this API spec and return a migration checklist."
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-4">
          <p className="font-medium text-[var(--text-primary)]">Draft with structure</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            "Write a release note from these commits with risks and rollback plan."
          </p>
        </div>
      </div>
    </div>
  )
}

export function MessageList({ messages, sending, onRegenerate }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const lastAssistantMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant') {
        return messages[index].id
      }
    }

    return null
  }, [messages])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <section className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6 sm:pt-8">
        <EmptyState />
      </section>
    )
  }

  return (
    <section className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-6" ref={containerRef}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-2">
        {messages.map((message) => (
          <MessageBubble
            canRegenerate={!sending && message.id === lastAssistantMessageId}
            isStreaming={sending && message.id === lastAssistantMessageId && message.status === 'streaming'}
            key={message.id}
            message={message}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>
    </section>
  )
}
