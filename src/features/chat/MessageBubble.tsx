import { isValidElement, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Check, Copy, RefreshCcw } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import type { ChatMessage } from '../../types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming: boolean
  canRegenerate: boolean
  onRegenerate: () => void
}

function formatMessageTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const language = useMemo(() => {
    const match = /language-([\w-]+)/.exec(className ?? '')
    return match?.[1] ?? 'text'
  }, [className])
  const codeText = useMemo(() => extractText(children).replace(/\n$/, ''), [children])

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-black/10 bg-[#111723] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/65">
        <span>{language}</span>
        <button
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
          onClick={async () => {
            await navigator.clipboard.writeText(codeText)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm text-[#dde6fb]">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map((entry) => extractText(entry)).join('')
  }

  if (isValidElement(node)) {
    const childProps = node.props as { children?: ReactNode }
    return extractText(childProps.children)
  }

  return ''
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className && !extractText(children).includes('\n')

    if (isInline) {
      return (
        <code
          className="rounded bg-black/8 px-1.5 py-0.5 font-mono text-[0.92em] text-[var(--text-primary)]"
          {...props}
        >
          {children}
        </code>
      )
    }

    return <CodeBlock className={className}>{children}</CodeBlock>
  },
  a({ ...props }) {
    return (
      <a
        {...props}
        className="font-medium text-[var(--accent-strong)] underline decoration-[var(--accent-strong)]/35 underline-offset-3"
        rel="noreferrer"
        target="_blank"
      />
    )
  },
}

export function MessageBubble({
  message,
  isStreaming,
  canRegenerate,
  onRegenerate,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  return (
    <article
      className={clsx(
        'message-enter group rounded-2xl border p-4 shadow-[0_4px_18px_rgba(27,25,20,0.06)]',
        isUser
          ? 'ml-auto w-fit max-w-[88%] border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
          : 'mr-auto w-full max-w-[58rem] border-[var(--surface-stroke)] bg-[var(--surface-muted)] text-[var(--text-primary)]',
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <p className="font-serif text-sm tracking-wide text-[var(--text-muted)]">
          {isUser ? 'You' : 'Qwen'}
        </p>
        <span className="text-xs text-[var(--text-dim)]">{formatMessageTime(message.createdAt)}</span>
      </header>

      {isUser ? (
        <p className="whitespace-pre-wrap text-[0.98rem] leading-relaxed">{message.content}</p>
      ) : (
        <div className="markdown-body max-w-none text-[0.98rem] leading-relaxed">
          <ReactMarkdown
            components={markdownComponents}
            rehypePlugins={[rehypeSanitize, rehypeHighlight]}
            remarkPlugins={[remarkGfm]}
          >
            {message.content || '...'}
          </ReactMarkdown>
          {isStreaming ? <span className="streaming-caret" aria-hidden="true" /> : null}
        </div>
      )}

      {message.status === 'error' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{message.error ?? 'Generation failed.'}</span>
          {isAssistant && canRegenerate ? (
            <button
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
              onClick={onRegenerate}
              type="button"
            >
              <RefreshCcw size={12} />
              Regenerate
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
