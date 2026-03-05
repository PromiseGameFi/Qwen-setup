import type { OpenEditorTab } from '../types/ui'

interface EditorTabsProps {
  tabs: OpenEditorTab[]
  activePath: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
}

export function EditorTabs({ tabs, activePath, onSelectTab, onCloseTab }: EditorTabsProps) {
  return (
    <div className="editor-tabs-strip">
      {tabs.length === 0 ? (
        <div className="editor-tabs empty">
          <span>No open editors</span>
        </div>
      ) : (
        <div className="editor-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.path}
              className={`editor-tab ${activePath === tab.path ? 'active' : ''}`}
              type="button"
              onClick={() => onSelectTab(tab.path)}
            >
              <span className="codicon codicon-file-code" />
              <span className="tab-title">{tab.title}</span>
              {tab.dirty ? <span className="tab-dirty">●</span> : null}
              <span
                className="tab-close"
                role="presentation"
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTab(tab.path)
                }}
              >
                <span className="codicon codicon-close" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="editor-toolbar-actions">
        <button type="button" title="Split Editor Right">
          <span className="codicon codicon-split-horizontal" />
        </button>
        <button type="button" title="More Actions">
          <span className="codicon codicon-ellipsis" />
        </button>
      </div>
    </div>
  )
}
