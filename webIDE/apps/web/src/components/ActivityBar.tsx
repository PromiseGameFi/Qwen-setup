import type { ViewId } from '../types/ui'

interface ActivityBarProps {
  activeView: ViewId
  onSelectView: (view: ViewId) => void
  onOpenCommandPalette: () => void
  problemCount: number
  onOpenProblems: () => void
  assistantVisible: boolean
  onToggleAssistant: () => void
}

export function ActivityBar({
  activeView,
  onSelectView,
  onOpenCommandPalette,
  problemCount,
  onOpenProblems,
  assistantVisible,
  onToggleAssistant,
}: ActivityBarProps) {
  return (
    <aside className="activity-bar" aria-label="Activity Bar">
      <div className="activity-main">
        <button
          className={`activity-item ${activeView === 'explorer' ? 'active' : ''}`}
          title="Explorer (Alt+1)"
          type="button"
          onClick={() => onSelectView('explorer')}
        >
          <span className="codicon codicon-files" />
        </button>

        <button
          className={`activity-item ${activeView === 'search' ? 'active' : ''}`}
          title="Search (Alt+2)"
          type="button"
          onClick={() => onSelectView('search')}
        >
          <span className="codicon codicon-search" />
        </button>

        <button
          className={`activity-item ${activeView === 'scm' ? 'active' : ''}`}
          title="Source Control (Alt+3)"
          type="button"
          onClick={() => onSelectView('scm')}
        >
          <span className="codicon codicon-source-control" />
        </button>

        <button
          className={`activity-item ${activeView === 'run' ? 'active' : ''}`}
          title="Run and Debug (Alt+4)"
          type="button"
          onClick={() => onSelectView('run')}
        >
          <span className="codicon codicon-run-all" />
        </button>

        <button
          className={`activity-item ${activeView === 'extensions' ? 'active' : ''}`}
          title="Extensions (Alt+5)"
          type="button"
          onClick={() => onSelectView('extensions')}
        >
          <span className="codicon codicon-extensions" />
        </button>
      </div>

      <div className="activity-bottom">
        <button className="activity-item" title="Problems" type="button" onClick={onOpenProblems}>
          <span className="codicon codicon-warning" />
          {problemCount > 0 ? <span className="activity-badge">{problemCount}</span> : null}
        </button>
        <button className="activity-item" title="Command Palette" type="button" onClick={onOpenCommandPalette}>
          <span className="codicon codicon-terminal-cmd" />
        </button>
        <button
          className={`activity-item ${assistantVisible ? 'active' : ''}`}
          title="Cursor Assistant (Alt+6)"
          type="button"
          onClick={onToggleAssistant}
        >
          <span className="codicon codicon-sparkle" />
        </button>
        <button className="activity-item" title="Accounts" type="button">
          <span className="codicon codicon-account" />
        </button>
        <button className="activity-item" title="Manage" type="button">
          <span className="codicon codicon-settings-gear" />
        </button>
      </div>
    </aside>
  )
}
