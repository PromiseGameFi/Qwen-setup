import { useMemo, useState } from 'react'

import type { WorkspaceTreeNode } from '@webide/protocol'

import type { OpenEditorTab, ViewId } from '../types/ui'

interface WorkspaceItem {
  id: string
  rootPath: string
  label: string
}

interface ExplorerPaneProps {
  activeView: ViewId
  visible: boolean
  workspaceInput: string
  onWorkspaceInputChange: (value: string) => void
  onOpenWorkspace: () => void
  busy: boolean
  workspaces: WorkspaceItem[]
  workspaceId: string | null
  onSelectWorkspace: (workspaceId: string) => void
  fileFilter: string
  onFileFilterChange: (value: string) => void
  files: string[]
  tree: WorkspaceTreeNode | null
  expandedDirectories: string[]
  onToggleDirectory: (path: string) => void
  selectedFile: string | null
  onSelectFile: (path: string) => void
  openTabs: OpenEditorTab[]
  onSelectEditorTab: (path: string) => void
  onBeginResize: (clientX: number) => void
}

export function ExplorerPane({
  activeView,
  visible,
  workspaceInput,
  onWorkspaceInputChange,
  onOpenWorkspace,
  busy,
  workspaces,
  workspaceId,
  onSelectWorkspace,
  fileFilter,
  onFileFilterChange,
  files,
  tree,
  expandedDirectories,
  onToggleDirectory,
  selectedFile,
  onSelectFile,
  openTabs,
  onSelectEditorTab,
  onBeginResize,
}: ExplorerPaneProps) {
  const [openEditorsVisible, setOpenEditorsVisible] = useState(true)
  const [foldersVisible, setFoldersVisible] = useState(true)
  const [filesVisible, setFilesVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(true)
  const [timelineVisible, setTimelineVisible] = useState(true)

  const expandedSet = useMemo(() => new Set(expandedDirectories), [expandedDirectories])

  const rootNodes = useMemo(() => {
    if (!tree) {
      return []
    }

    if (tree.type === 'directory') {
      return [...(tree.children ?? [])]
    }

    return [tree]
  }, [tree])

  const sortedRootNodes = useMemo(() => sortNodes(rootNodes), [rootNodes])

  return (
    <aside className={`explorer-pane ${visible ? 'visible' : 'hidden'}`}>
      <div className="pane-title-row">
        <div className="pane-title">{labelForView(activeView)}</div>
        <div className="pane-title-actions">
          <button type="button" title="New File">
            <span className="codicon codicon-new-file" />
          </button>
          <button type="button" title="New Folder">
            <span className="codicon codicon-new-folder" />
          </button>
          <button type="button" title="Refresh">
            <span className="codicon codicon-refresh" />
          </button>
          <button type="button" title="Collapse Folders">
            <span className="codicon codicon-collapse-all" />
          </button>
        </div>
      </div>

      {activeView === 'explorer' ? (
        <>
          <section className="explorer-section open-editors">
            <SectionHeader
              title="OPEN EDITORS"
              count={openTabs.length}
              open={openEditorsVisible}
              onToggle={() => setOpenEditorsVisible((current) => !current)}
            />
            {openEditorsVisible ? (
              <div className="open-editors-list">
                {openTabs.map((tab) => (
                  <button
                    key={tab.path}
                    className={`file-item ${tab.active ? 'active' : ''}`}
                    type="button"
                    onClick={() => onSelectEditorTab(tab.path)}
                  >
                    <span className={`codicon ${iconForFile(tab.path)}`} />
                    <span>{tab.title}</span>
                    {tab.dirty ? <span className="dirty-dot">●</span> : null}
                  </button>
                ))}

                {openTabs.length === 0 ? <p className="pane-empty">No open editors.</p> : null}
              </div>
            ) : null}
          </section>

          <section className="explorer-section folders-section">
            <SectionHeader
              title="FOLDERS"
              open={foldersVisible}
              onToggle={() => setFoldersVisible((current) => !current)}
            />
            {foldersVisible ? (
              <>
                <div className="workspace-open-row">
                  <input
                    value={workspaceInput}
                    onChange={(event) => onWorkspaceInputChange(event.target.value)}
                    placeholder="/path/to/project"
                  />
                  <button disabled={busy} type="button" onClick={onOpenWorkspace}>
                    Open
                  </button>
                </div>

                <select value={workspaceId ?? ''} onChange={(event) => onSelectWorkspace(event.target.value)}>
                  <option value="">Select workspace</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </section>

          <section className="explorer-section files-section">
            <SectionHeader
              title="EXPLORER"
              open={filesVisible}
              onToggle={() => setFilesVisible((current) => !current)}
            />
            {filesVisible ? (
              <>
                <div className="filter-input-wrap">
                  <span className="codicon codicon-search" />
                  <input
                    value={fileFilter}
                    onChange={(event) => onFileFilterChange(event.target.value)}
                    placeholder="Filter files"
                  />
                </div>

                <div className="files-list">
                  {fileFilter.trim() ? (
                    files.map((file) => (
                      <button
                        key={file}
                        className={`file-item ${selectedFile === file ? 'active' : ''}`}
                        type="button"
                        onClick={() => onSelectFile(file)}
                      >
                        <span className={`codicon ${iconForFile(file)}`} />
                        <span>{file}</span>
                      </button>
                    ))
                  ) : (
                    <TreeNodes
                      nodes={sortedRootNodes}
                      depth={0}
                      expandedSet={expandedSet}
                      selectedFile={selectedFile}
                      onSelectFile={onSelectFile}
                      onToggleDirectory={onToggleDirectory}
                    />
                  )}

                  {files.length === 0 && !fileFilter.trim() && sortedRootNodes.length === 0 ? (
                    <p className="pane-empty">No files to display.</p>
                  ) : null}
                  {files.length === 0 && fileFilter.trim() ? <p className="pane-empty">No files match this filter.</p> : null}
                </div>
              </>
            ) : null}
          </section>

          <section className="explorer-section placeholder-dense">
            <SectionHeader
              title="OUTLINE"
              open={outlineVisible}
              onToggle={() => setOutlineVisible((current) => !current)}
            />
            {outlineVisible ? <p className="pane-empty">Symbol outline for active file will appear here.</p> : null}
          </section>

          <section className="explorer-section placeholder-dense">
            <SectionHeader
              title="TIMELINE"
              open={timelineVisible}
              onToggle={() => setTimelineVisible((current) => !current)}
            />
            {timelineVisible ? <p className="pane-empty">File and run history timeline will appear here.</p> : null}
          </section>
        </>
      ) : null}

      {activeView === 'search' ? (
        <section className="placeholder-pane">
          <span className="codicon codicon-search" />
          <p>Search across files (workspace grep) is the next step.</p>
          <small>Use Ctrl+P for quick file open.</small>
        </section>
      ) : null}

      {activeView === 'outline' ? (
        <section className="placeholder-pane">
          <span className="codicon codicon-symbol-namespace" />
          <p>Outline mode will show file symbols and structure tree.</p>
        </section>
      ) : null}

      <div
        className="sidebar-resizer"
        role="presentation"
        onMouseDown={(event) => {
          event.preventDefault()
          onBeginResize(event.clientX)
        }}
      />
    </aside>
  )
}

interface SectionHeaderProps {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
}

function SectionHeader({ title, count, open, onToggle }: SectionHeaderProps) {
  return (
    <div className="section-head-row">
      <button className="section-toggle" type="button" onClick={onToggle}>
        <span className={`codicon ${open ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
        <span className="section-heading">{title}</span>
      </button>
      {count !== undefined ? <span className="section-meta">{count}</span> : null}
    </div>
  )
}

interface TreeNodesProps {
  nodes: WorkspaceTreeNode[]
  depth: number
  expandedSet: Set<string>
  selectedFile: string | null
  onSelectFile: (path: string) => void
  onToggleDirectory: (path: string) => void
}

function TreeNodes({ nodes, depth, expandedSet, selectedFile, onSelectFile, onToggleDirectory }: TreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'directory') {
          const expanded = expandedSet.has(node.path)
          const childNodes = sortNodes(node.children ?? [])

          return (
            <div key={node.path}>
              <button
                className="tree-row directory"
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                type="button"
                onClick={() => onToggleDirectory(node.path)}
              >
                <span className={`codicon ${expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                <span className={`codicon ${expanded ? 'codicon-folder-opened' : 'codicon-folder'}`} />
                <span>{node.name}</span>
              </button>

              {expanded && childNodes.length > 0 ? (
                <TreeNodes
                  nodes={childNodes}
                  depth={depth + 1}
                  expandedSet={expandedSet}
                  selectedFile={selectedFile}
                  onSelectFile={onSelectFile}
                  onToggleDirectory={onToggleDirectory}
                />
              ) : null}
            </div>
          )
        }

        return (
          <button
            key={node.path}
            className={`tree-row file ${selectedFile === node.path ? 'active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            type="button"
            onClick={() => onSelectFile(node.path)}
          >
            <span className="codicon codicon-circle-large-outline" />
            <span className={`codicon ${iconForFile(node.path)}`} />
            <span>{node.name}</span>
          </button>
        )
      })}
    </>
  )
}

function sortNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })
}

function labelForView(view: ViewId): string {
  if (view === 'explorer') {
    return 'Explorer'
  }

  if (view === 'search') {
    return 'Search'
  }

  return 'Outline'
}

function iconForFile(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx')) {
    return 'codicon-file-code'
  }

  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml')) {
    return 'codicon-json'
  }

  if (lower.endsWith('.md')) {
    return 'codicon-markdown'
  }

  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) {
    return 'codicon-symbol-color'
  }

  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.svg')) {
    return 'codicon-file-media'
  }

  return 'codicon-file'
}
