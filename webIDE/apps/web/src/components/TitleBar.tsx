interface TitleBarProps {
  projectName: string
  paired: boolean
  runLabel: string
  onOpenCommandPalette: () => void
  onOpenQuickFile: () => void
  onToggleExplorer: () => void
}

const MENU_ITEMS = ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'] as const

export function TitleBar({
  projectName,
  paired,
  runLabel,
  onOpenCommandPalette,
  onOpenQuickFile,
  onToggleExplorer,
}: TitleBarProps) {
  return (
    <header className="titlebar-stack">
      <div className="titlebar-row titlebar-top">
        <div className="titlebar-left">
          <button className="icon-button mobile-only" type="button" onClick={onToggleExplorer}>
            <span className="codicon codicon-layout-sidebar-left" />
          </button>
          <span className="titlebar-product">WebIDE</span>
          <span className="titlebar-project">{projectName || 'No Folder Opened'}</span>
        </div>

        <div className="titlebar-center">
          <button className="command-center" type="button" onClick={onOpenCommandPalette}>
            <span className="codicon codicon-search" />
            <span>Search and run commands</span>
            <kbd>Ctrl+Shift+P</kbd>
          </button>
        </div>

        <div className="titlebar-right">
          <button className="titlebar-icon" title="Quick Open" type="button" onClick={onOpenQuickFile}>
            <span className="codicon codicon-go-to-file" />
          </button>
          <button className="titlebar-icon" title="Command Palette" type="button" onClick={onOpenCommandPalette}>
            <span className="codicon codicon-terminal-cmd" />
          </button>
          <span className="status-chip">{paired ? 'Bridge: Paired' : 'Bridge: Unpaired'}</span>
          <span className="status-chip">Run: {runLabel}</span>
        </div>
      </div>

      <div className="titlebar-row menubar">
        <nav className="menu-items" aria-label="Menu Bar">
          {MENU_ITEMS.map((item) => (
            <button key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <div className="window-controls">
          <button type="button" aria-label="Minimize">
            <span className="codicon codicon-chrome-minimize" />
          </button>
          <button type="button" aria-label="Maximize">
            <span className="codicon codicon-chrome-maximize" />
          </button>
          <button type="button" aria-label="Close">
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>
    </header>
  )
}
