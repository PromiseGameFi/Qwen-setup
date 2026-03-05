import { useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

import type { AgentMode, AgentRunEvent } from '@webide/protocol'

import type { BottomTabId, ProblemItem } from '../types/ui'

interface BottomPanelProps {
  activeTab: BottomTabId
  onTabChange: (tab: BottomTabId) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  height: number
  onHeightChange: (height: number) => void
  terminalInputRef: RefObject<HTMLInputElement | null>
  command: string
  onCommandChange: (value: string) => void
  commandOutput: string
  confirmRequired: boolean
  busy: boolean
  workspaceReady: boolean
  onRunCommand: (confirmed?: boolean) => void
  goal: string
  onGoalChange: (value: string) => void
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onStartRun: () => void
  onCancelRun: () => void
  runId: string | null
  events: AgentRunEvent[]
  outputLog: string[]
  problems: ProblemItem[]
}

export function BottomPanel({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  height,
  onHeightChange,
  terminalInputRef,
  command,
  onCommandChange,
  commandOutput,
  confirmRequired,
  busy,
  workspaceReady,
  onRunCommand,
  goal,
  onGoalChange,
  mode,
  onModeChange,
  onStartRun,
  onCancelRun,
  runId,
  events,
  outputLog,
  problems,
}: BottomPanelProps) {
  const resizingRef = useRef<{
    startY: number
    startHeight: number
  } | null>(null)

  const beginResize = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (collapsed) {
      return
    }

    resizingRef.current = {
      startY: event.clientY,
      startHeight: height,
    }

    const onMouseMove = (moveEvent: globalThis.MouseEvent): void => {
      const context = resizingRef.current
      if (!context) {
        return
      }

      const delta = context.startY - moveEvent.clientY
      const next = Math.max(140, Math.min(560, context.startHeight + delta))
      onHeightChange(next)
    }

    const onMouseUp = (): void => {
      resizingRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <section className={`bottom-panel ${collapsed ? 'collapsed' : ''}`} style={{ height: collapsed ? 34 : height }}>
      <div className="panel-resizer" role="presentation" onMouseDown={beginResize} />

      <div className="bottom-panel-header">
        <div className="bottom-tabs">
          <button className={activeTab === 'problems' ? 'active' : ''} type="button" onClick={() => onTabChange('problems')}>
            PROBLEMS ({problems.length})
          </button>
          <button className={activeTab === 'output' ? 'active' : ''} type="button" onClick={() => onTabChange('output')}>
            OUTPUT
          </button>
          <button className={activeTab === 'debug_console' ? 'active' : ''} type="button" onClick={() => onTabChange('debug_console')}>
            DEBUG CONSOLE
          </button>
          <button className={activeTab === 'terminal' ? 'active' : ''} type="button" onClick={() => onTabChange('terminal')}>
            TERMINAL
          </button>
          <button className={activeTab === 'ports' ? 'active' : ''} type="button" onClick={() => onTabChange('ports')}>
            PORTS
          </button>
          <button className={activeTab === 'agent' ? 'active' : ''} type="button" onClick={() => onTabChange('agent')}>
            AGENT
          </button>
        </div>

        <div className="panel-header-actions">
          <button type="button" title="Toggle Maximized Panel" onClick={onToggleCollapsed}>
            <span className={`codicon ${collapsed ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} />
          </button>
          <button type="button" title="Panel Actions">
            <span className="codicon codicon-ellipsis" />
          </button>
          <button type="button" title="Close Panel" onClick={onToggleCollapsed}>
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="bottom-panel-content">
          {activeTab === 'terminal' ? (
            <div className="terminal-tab">
              <div className="terminal-head">
                <button className="terminal-instance" type="button">
                  <span className="codicon codicon-terminal" />
                  <span>1: shell</span>
                </button>
                <div className="terminal-head-actions">
                  <button type="button" title="Split Terminal">
                    <span className="codicon codicon-split-horizontal" />
                  </button>
                  <button type="button" title="Kill Terminal">
                    <span className="codicon codicon-trash" />
                  </button>
                </div>
              </div>

              <div className="terminal-controls">
                <input
                  ref={terminalInputRef}
                  value={command}
                  onChange={(event) => onCommandChange(event.target.value)}
                  placeholder="Run command in workspace"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onRunCommand(false)
                    }
                  }}
                />
                <button disabled={busy || !workspaceReady} type="button" onClick={() => onRunCommand(false)}>
                  Run
                </button>
                {confirmRequired ? (
                  <button disabled={busy || !workspaceReady} type="button" onClick={() => onRunCommand(true)}>
                    Confirm + Run
                  </button>
                ) : null}
              </div>
              <pre>{commandOutput || 'Terminal output will appear here.'}</pre>
            </div>
          ) : null}

          {activeTab === 'agent' ? (
            <div className="agent-tab">
              <textarea
                value={goal}
                onChange={(event) => onGoalChange(event.target.value)}
                placeholder="Describe your coding goal for the agent"
              />
              <div className="agent-controls-row">
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

              <div className="agent-events">
                {events.map((event) => (
                  <div key={`${event.id}-${event.kind}`} className="event-item">
                    <p>{event.kind}</p>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                ))}
                {events.length === 0 ? <p className="panel-empty">No agent timeline events yet.</p> : null}
              </div>
            </div>
          ) : null}

          {activeTab === 'output' ? (
            <div className="output-tab">
              <pre>{outputLog.length > 0 ? outputLog.join('\n') : 'General output log is empty.'}</pre>
            </div>
          ) : null}

          {activeTab === 'debug_console' ? (
            <div className="output-tab">
              <pre>{events.length > 0 ? JSON.stringify(events.slice(-20), null, 2) : 'Debug console has no entries.'}</pre>
            </div>
          ) : null}

          {activeTab === 'ports' ? (
            <div className="output-tab">
              <pre>127.0.0.1:4317  (bridge)\n127.0.0.1:5174  (web)\n127.0.0.1:8012  (model when running)</pre>
            </div>
          ) : null}

          {activeTab === 'problems' ? (
            <div className="problems-tab">
              {problems.length === 0 ? <p className="panel-empty">No problems detected.</p> : null}
              {problems.map((problem, index) => (
                <div key={`${problem.source}-${problem.severity}-${index}`} className={`problem-item ${problem.severity}`}>
                  <span className="problem-source">
                    <span className={`codicon ${problem.severity === 'error' ? 'codicon-error' : 'codicon-warning'}`} />
                    <span>{problem.source}</span>
                  </span>
                  <span className="problem-message">{problem.message}</span>
                  {problem.file ? <span className="problem-location">{problem.file}:{problem.line ?? 0}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
