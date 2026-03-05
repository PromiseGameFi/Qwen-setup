import { useMemo, useState } from 'react'

import type { AgentMode, AgentRunEvent } from '@webide/protocol'

import type { AssistantTabId, OpenEditorTab } from '../types/ui'

interface AssistantSidebarProps {
  visible: boolean
  width: number
  activeTab: AssistantTabId
  onTabChange: (tab: AssistantTabId) => void
  onClose: () => void
  onBeginResize: (clientX: number) => void
  modelLabel: string
  runLabel: string
  workspaceLabel: string
  activeFilePath: string | null
  openTabs: OpenEditorTab[]
  goal: string
  onGoalChange: (value: string) => void
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onStartRun: () => void
  onCancelRun: () => void
  runId: string | null
  busy: boolean
  workspaceReady: boolean
  events: AgentRunEvent[]
}

export function AssistantSidebar({
  visible,
  width,
  activeTab,
  onTabChange,
  onClose,
  onBeginResize,
  modelLabel,
  runLabel,
  workspaceLabel,
  activeFilePath,
  openTabs,
  goal,
  onGoalChange,
  mode,
  onModeChange,
  onStartRun,
  onCancelRun,
  runId,
  busy,
  workspaceReady,
  events,
}: AssistantSidebarProps) {
  const [chatInput, setChatInput] = useState('')

  const eventFeed = useMemo(() => events.slice(-40), [events])

  if (!visible) {
    return null
  }

  return (
    <aside className="assistant-sidebar" style={{ width }}>
      <div
        className="assistant-resizer"
        role="presentation"
        onMouseDown={(event) => {
          event.preventDefault()
          onBeginResize(event.clientX)
        }}
      />

      <header className="assistant-header">
        <div className="assistant-title-row">
          <span className="assistant-title">
            <span className="codicon codicon-sparkle" />
            <span>Cursor Assistant</span>
          </span>
          <span className="assistant-model-chip">{modelLabel}</span>
        </div>

        <div className="assistant-tab-row">
          <button className={activeTab === 'chat' ? 'active' : ''} type="button" onClick={() => onTabChange('chat')}>
            Chat
          </button>
          <button className={activeTab === 'composer' ? 'active' : ''} type="button" onClick={() => onTabChange('composer')}>
            Composer
          </button>
          <button className={activeTab === 'context' ? 'active' : ''} type="button" onClick={() => onTabChange('context')}>
            Context
          </button>
        </div>

        <div className="assistant-header-actions">
          <button type="button" title="New Chat" onClick={() => setChatInput('')}>
            <span className="codicon codicon-add" />
          </button>
          <button type="button" title="Close Assistant" onClick={onClose}>
            <span className="codicon codicon-close" />
          </button>
        </div>
      </header>

      <div className="assistant-content">
        {activeTab === 'chat' ? (
          <section className="assistant-chat">
            <div className="assistant-feed">
              {eventFeed.length === 0 ? (
                <p className="assistant-empty">No conversation yet. Start an agent run or ask a coding question.</p>
              ) : (
                eventFeed.map((event) => (
                  <article key={`${event.id}-${event.kind}`} className="assistant-event">
                    <div className="assistant-event-head">
                      <span className="assistant-role">agent</span>
                      <span>{event.kind}</span>
                    </div>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </article>
                ))
              )}
            </div>

            <div className="assistant-input-row">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask assistant to inspect code, explain errors, or propose a patch..."
              />
              <button disabled={!chatInput.trim()} type="button" onClick={() => setChatInput('')}>
                Send
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'composer' ? (
          <section className="assistant-composer">
            <div className="assistant-metadata">
              <span>
                <span className="codicon codicon-pulse" />
                {runLabel}
              </span>
              <span>
                <span className="codicon codicon-settings" />
                {mode.toUpperCase()}
              </span>
            </div>

            <textarea
              value={goal}
              onChange={(event) => onGoalChange(event.target.value)}
              placeholder="Describe what to build/fix. Example: add auth middleware and tests for 401/403 paths."
            />

            <div className="assistant-controls-row">
              <select value={mode} onChange={(event) => onModeChange(event.target.value as AgentMode)}>
                <option value="plan">Plan</option>
                <option value="execute">Execute</option>
                <option value="repair">Repair</option>
              </select>
              <button disabled={busy || !workspaceReady || !goal.trim()} type="button" onClick={onStartRun}>
                Start Run
              </button>
              <button disabled={!runId} type="button" onClick={onCancelRun}>
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'context' ? (
          <section className="assistant-context">
            <div className="context-group">
              <p>Workspace</p>
              <span>{workspaceLabel}</span>
            </div>
            <div className="context-group">
              <p>Active File</p>
              <span>{activeFilePath ?? 'No file selected'}</span>
            </div>
            <div className="context-group">
              <p>Open Tabs</p>
              <div className="context-tags">
                {openTabs.length === 0 ? <span className="context-tag muted">None</span> : null}
                {openTabs.map((tab) => (
                  <span key={tab.path} className={`context-tag ${tab.active ? 'active' : ''}`}>
                    {tab.title}
                    {tab.dirty ? '*' : ''}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  )
}
