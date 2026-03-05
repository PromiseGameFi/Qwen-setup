import type { BottomTabId } from '../types/ui'

interface StatusBarProps {
  workspaceLabel: string
  modelLabel: string
  runLabel: string
  cursorLabel: string
  activeBottomTab: BottomTabId
  errorCount: number
  warningCount: number
  languageLabel: string
}

export function StatusBar({
  workspaceLabel,
  modelLabel,
  runLabel,
  cursorLabel,
  activeBottomTab,
  errorCount,
  warningCount,
  languageLabel,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className="status-item prominent">
          <span className="codicon codicon-remote" />
          <span>local</span>
        </span>
        <span className="status-item">
          <span className="codicon codicon-source-control" />
          <span>main*</span>
        </span>
        <span className="status-item">
          <span className="codicon codicon-sync" />
          <span>Sync</span>
        </span>
        <span className="status-item">
          <span className="codicon codicon-error" />
          <span>{errorCount}</span>
          <span className="codicon codicon-warning" />
          <span>{warningCount}</span>
        </span>
        <span className="status-item">
          <span className="codicon codicon-folder-opened" />
          <span>{workspaceLabel}</span>
        </span>
      </div>

      <div className="status-right">
        <span className="status-item">{runLabel}</span>
        <span className="status-item">{modelLabel}</span>
        <span className="status-item">{activeBottomTab.toUpperCase()}</span>
        <span className="status-item">{cursorLabel}</span>
        <span className="status-item">Spaces: 2</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">LF</span>
        <span className="status-item">{languageLabel}</span>
      </div>
    </footer>
  )
}
