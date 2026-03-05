import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'

import type {
  AgentMode,
  AgentRunEvent,
  AgentRunRequest,
  ModelStatus,
  WorkspaceTreeNode,
} from '@webide/protocol'
import {
  cancelRun,
  createCheckpoint,
  ensureModel,
  getModelStatus,
  getWorkspaceTree,
  listWorkspaces,
  openWorkspace,
  pairBridge,
  pingBridge,
  readFile,
  runCommand,
  startAgentRun,
  startModel,
  stopModel,
  streamAgentRun,
  writeFile,
} from './lib/api'
import { ActivityBar } from './components/ActivityBar'
import { AssistantSidebar } from './components/AssistantSidebar'
import { BottomPanel } from './components/BottomPanel'
import { CommandPalette } from './components/CommandPalette'
import { EditorTabs } from './components/EditorTabs'
import { ExplorerPane } from './components/ExplorerPane'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { deriveProblems } from './lib/problemParser'
import type {
  AssistantTabId,
  BottomTabId,
  CommandPaletteAction,
  OpenEditorTab,
  ViewId,
} from './types/ui'

interface WorkspaceItem {
  id: string
  rootPath: string
  label: string
}

type PaletteMode = 'commands' | 'files'

export function App() {
  const [bridgeOnline, setBridgeOnline] = useState(false)
  const [paired, setPaired] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)

  const [workspaceInput, setWorkspaceInput] = useState('')
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [tree, setTree] = useState<WorkspaceTreeNode | null>(null)

  const [activeView, setActiveView] = useState<ViewId>('explorer')
  const [explorerVisible, setExplorerVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [assistantVisible, setAssistantVisible] = useState(true)
  const [assistantWidth, setAssistantWidth] = useState(360)
  const [assistantTab, setAssistantTab] = useState<AssistantTabId>('chat')
  const [fileFilter, setFileFilter] = useState('')
  const [expandedDirectories, setExpandedDirectories] = useState<string[]>([])

  const [openTabs, setOpenTabs] = useState<OpenEditorTab[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [fileContentsByPath, setFileContentsByPath] = useState<Record<string, string>>({})
  const [cursorLabel, setCursorLabel] = useState('Ln 1, Col 1')

  const [bottomTab, setBottomTab] = useState<BottomTabId>('terminal')
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(240)

  const [command, setCommand] = useState('npm test')
  const [commandOutput, setCommandOutput] = useState('')
  const [confirmRequired, setConfirmRequired] = useState(false)
  const [outputLog, setOutputLog] = useState<string[]>([])

  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<AgentMode>('execute')
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentRunEvent[]>([])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('commands')
  const [paletteQuery, setPaletteQuery] = useState('')

  const streamStopRef = useRef<(() => void) | null>(null)
  const sidebarResizeRef = useRef<{
    startX: number
    startWidth: number
  } | null>(null)
  const assistantResizeRef = useRef<{
    startX: number
    startWidth: number
  } | null>(null)
  const terminalInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void bootstrap()

    return () => {
      streamStopRef.current?.()
    }
  }, [])

  const fileList = useMemo(() => flattenFiles(tree), [tree])

  const filteredFiles = useMemo(() => {
    const normalized = fileFilter.trim().toLowerCase()
    if (!normalized) {
      return fileList
    }

    return fileList.filter((file) => file.toLowerCase().includes(normalized))
  }, [fileFilter, fileList])

  const activeFileContent = activeFilePath ? fileContentsByPath[activeFilePath] ?? '' : ''
  const breadcrumbs = useMemo(
    () =>
      activeFilePath
        ? activeFilePath
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean)
        : [],
    [activeFilePath],
  )

  const problems = useMemo(() => deriveProblems(commandOutput, events), [commandOutput, events])
  const errorCount = useMemo(
    () => problems.filter((item) => item.severity === 'error').length,
    [problems],
  )
  const warningCount = useMemo(
    () => problems.filter((item) => item.severity === 'warning').length,
    [problems],
  )

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces],
  )

  const runLabel = useMemo(() => {
    if (!runId) {
      return 'Idle'
    }

    const terminal = [...events]
      .reverse()
      .find((event) => event.kind === 'run.completed' || event.kind === 'run.failed' || event.kind === 'run.cancelled')

    if (!terminal) {
      return 'Running'
    }

    if (terminal.kind === 'run.completed') {
      return 'Completed'
    }

    if (terminal.kind === 'run.cancelled') {
      return 'Cancelled'
    }

    return 'Failed'
  }, [events, runId])

  const commandActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: 'open-workspace',
        label: 'Open Workspace',
        shortcut: 'Enter',
        icon: 'codicon-folder-opened',
        run: () => {
          void handleOpenWorkspace()
        },
      },
      {
        id: 'quick-open',
        label: 'Quick Open File',
        shortcut: 'Ctrl+P',
        icon: 'codicon-go-to-file',
        run: () => {
          setPaletteMode('files')
          setPaletteQuery('')
          setPaletteOpen(true)
        },
      },
      {
        id: 'save-file',
        label: 'Save Active File',
        shortcut: 'Ctrl+S',
        icon: 'codicon-save',
        run: () => {
          void handleSaveActiveFile()
        },
      },
      {
        id: 'ensure-model',
        label: 'Ensure Model',
        icon: 'codicon-cloud-download',
        run: () => {
          void handleModelAction('ensure')
        },
      },
      {
        id: 'start-model',
        label: 'Start Model',
        icon: 'codicon-play',
        run: () => {
          void handleModelAction('start')
        },
      },
      {
        id: 'stop-model',
        label: 'Stop Model',
        icon: 'codicon-debug-stop',
        run: () => {
          void handleModelAction('stop')
        },
      },
      {
        id: 'checkpoint',
        label: 'Create Checkpoint',
        icon: 'codicon-archive',
        run: () => {
          void handleCreateCheckpoint()
        },
      },
      {
        id: 'agent-run',
        label: 'Start Agent Run',
        icon: 'codicon-rocket',
        run: () => {
          void handleStartAgentRun()
        },
      },
      {
        id: 'focus-terminal',
        label: 'Terminal: Focus Terminal',
        shortcut: 'Ctrl+`',
        icon: 'codicon-terminal',
        run: () => {
          focusTerminal()
        },
      },
      {
        id: 'toggle-assistant',
        label: assistantVisible ? 'Cursor: Hide Assistant' : 'Cursor: Show Assistant',
        shortcut: 'Alt+6',
        icon: 'codicon-sparkle',
        run: () => {
          setAssistantVisible((current) => !current)
        },
      },
      {
        id: 'view-explorer',
        label: 'View: Open Explorer',
        shortcut: 'Alt+1',
        icon: 'codicon-files',
        run: () => {
          setActiveView('explorer')
          setExplorerVisible(true)
        },
      },
      {
        id: 'view-search',
        label: 'View: Open Search',
        shortcut: 'Alt+2',
        icon: 'codicon-search',
        run: () => {
          setActiveView('search')
          setExplorerVisible(true)
        },
      },
      {
        id: 'view-scm',
        label: 'View: Open Source Control',
        shortcut: 'Alt+3',
        icon: 'codicon-source-control',
        run: () => {
          setActiveView('scm')
          setExplorerVisible(true)
        },
      },
      {
        id: 'view-run',
        label: 'View: Open Run and Debug',
        shortcut: 'Alt+4',
        icon: 'codicon-run-all',
        run: () => {
          setActiveView('run')
          setExplorerVisible(true)
        },
      },
      {
        id: 'view-extensions',
        label: 'View: Open Extensions',
        shortcut: 'Alt+5',
        icon: 'codicon-extensions',
        run: () => {
          setActiveView('extensions')
          setExplorerVisible(true)
        },
      },
    ],
    [assistantVisible],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const primary = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (primary && event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteMode('commands')
        setPaletteQuery('')
        setPaletteOpen(true)
        return
      }

      if (primary && !event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteMode('files')
        setPaletteQuery('')
        setPaletteOpen(true)
        return
      }

      if (primary && key === 's') {
        event.preventDefault()
        void handleSaveActiveFile()
        return
      }

      if (event.ctrlKey && event.key === '`') {
        event.preventDefault()
        setBottomCollapsed(false)
        setBottomTab('terminal')
        setTimeout(() => {
          terminalInputRef.current?.focus()
        }, 0)
        return
      }

      if (event.altKey && key === '1') {
        event.preventDefault()
        setActiveView('explorer')
        setExplorerVisible(true)
        return
      }

      if (event.altKey && key === '2') {
        event.preventDefault()
        setActiveView('search')
        setExplorerVisible(true)
        return
      }

      if (event.altKey && key === '3') {
        event.preventDefault()
        setActiveView('outline')
        setExplorerVisible(true)
        return
      }

      if (event.key === 'Escape' && paletteOpen) {
        event.preventDefault()
        setPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteOpen, workspaceId, activeFilePath, command, goal, mode])

  async function bootstrap(): Promise<void> {
    setInitializing(true)
    setError(null)

    const online = await pingBridge()
    setBridgeOnline(online)

    if (!online) {
      setInitializing(false)
      return
    }

    try {
      await pairBridge()
      setPaired(true)

      const [model, items] = await Promise.all([getModelStatus(), listWorkspaces()])
      setModelStatus(model)
      setWorkspaces(items)

      if (items.length > 0) {
        setWorkspaceId(items[0].id)
        await refreshTree(items[0].id)
      }
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setInitializing(false)
    }
  }

  async function refreshTree(id: string): Promise<void> {
    const payload = await getWorkspaceTree(id)
    setTree(payload.tree)
    if (payload.tree.type === 'directory') {
      setExpandedDirectories((current) => {
        if (current.includes(payload.tree.path)) {
          return current
        }
        return [payload.tree.path, ...current]
      })
    }
  }

  function appendOutput(line: string): void {
    setOutputLog((current) => [...current, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-500))
  }

  function expandDirectoriesForPath(pathValue: string): void {
    const normalized = pathValue.replace(/\\/g, '/')
    const segments = normalized.split('/').filter(Boolean)
    if (segments.length <= 1) {
      return
    }

    setExpandedDirectories((current) => {
      const next = new Set(current)
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segmentPath = segments.slice(0, index + 1).join('/')
        next.add(segmentPath)
      }
      return [...next]
    })
  }

  function handleToggleDirectory(pathValue: string): void {
    setExpandedDirectories((current) =>
      current.includes(pathValue) ? current.filter((entry) => entry !== pathValue) : [...current, pathValue],
    )
  }

  function beginSidebarResize(clientX: number): void {
    if (!explorerVisible) {
      return
    }

    sidebarResizeRef.current = {
      startX: clientX,
      startWidth: sidebarWidth,
    }

    const onMouseMove = (event: MouseEvent): void => {
      const context = sidebarResizeRef.current
      if (!context) {
        return
      }

      const delta = event.clientX - context.startX
      const next = Math.max(220, Math.min(520, context.startWidth + delta))
      setSidebarWidth(next)
    }

    const onMouseUp = (): void => {
      sidebarResizeRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function beginAssistantResize(clientX: number): void {
    if (!assistantVisible) {
      return
    }

    assistantResizeRef.current = {
      startX: clientX,
      startWidth: assistantWidth,
    }

    const onMouseMove = (event: MouseEvent): void => {
      const context = assistantResizeRef.current
      if (!context) {
        return
      }

      const delta = context.startX - event.clientX
      const next = Math.max(280, Math.min(560, context.startWidth + delta))
      setAssistantWidth(next)
    }

    const onMouseUp = (): void => {
      assistantResizeRef.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function focusTerminal(): void {
    setBottomCollapsed(false)
    setBottomTab('terminal')
    setTimeout(() => {
      terminalInputRef.current?.focus()
    }, 0)
  }

  async function handleOpenWorkspace(): Promise<void> {
    if (!workspaceInput.trim()) {
      setError('Enter an absolute workspace path first.')
      return
    }

    setBusy(true)
    setError(null)

    try {
      const workspace = await openWorkspace(workspaceInput.trim())
      const items = await listWorkspaces()
      setWorkspaces(items)
      setWorkspaceId(workspace.id)
      setOpenTabs([])
      setActiveFilePath(null)
      setFileContentsByPath({})
      setExpandedDirectories([])
      await refreshTree(workspace.id)
      appendOutput(`Opened workspace: ${workspace.rootPath}`)
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleSelectFile(pathValue: string): Promise<void> {
    if (!workspaceId) {
      return
    }

    setError(null)
    setActiveFilePath(pathValue)
    expandDirectoriesForPath(pathValue)

    setOpenTabs((current) => {
      const exists = current.some((tab) => tab.path === pathValue)
      const next = exists
        ? current.map((tab) => ({ ...tab, active: tab.path === pathValue }))
        : [
            ...current.map((tab) => ({ ...tab, active: false })),
            {
              path: pathValue,
              title: fileName(pathValue),
              dirty: false,
              active: true,
            },
          ]

      return next
    })

    if (fileContentsByPath[pathValue] !== undefined) {
      return
    }

    try {
      const content = await readFile(workspaceId, pathValue)
      setFileContentsByPath((current) => ({
        ...current,
        [pathValue]: content,
      }))
    } catch (caught) {
      setError(asErrorMessage(caught))
    }
  }

  function handleEditorChange(value: string | undefined): void {
    if (!activeFilePath) {
      return
    }

    const normalized = value ?? ''

    setFileContentsByPath((current) => ({
      ...current,
      [activeFilePath]: normalized,
    }))

    setOpenTabs((current) =>
      current.map((tab) =>
        tab.path === activeFilePath
          ? {
              ...tab,
              dirty: true,
            }
          : tab,
      ),
    )
  }

  async function handleSaveActiveFile(): Promise<void> {
    if (!workspaceId || !activeFilePath) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      await writeFile(workspaceId, activeFilePath, fileContentsByPath[activeFilePath] ?? '')
      setOpenTabs((current) =>
        current.map((tab) =>
          tab.path === activeFilePath
            ? {
                ...tab,
                dirty: false,
              }
            : tab,
        ),
      )
      await refreshTree(workspaceId)
      appendOutput(`Saved ${activeFilePath}`)
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  function handleCloseTab(pathValue: string): void {
    setOpenTabs((current) => {
      const index = current.findIndex((tab) => tab.path === pathValue)
      const nextTabs = current.filter((tab) => tab.path !== pathValue)

      if (activeFilePath === pathValue) {
        const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? null
        setActiveFilePath(fallback?.path ?? null)
      }

      return nextTabs.map((tab) => ({
        ...tab,
        active: tab.path === (activeFilePath === pathValue ? nextTabs[index]?.path ?? nextTabs[index - 1]?.path : activeFilePath),
      }))
    })
  }

  async function handleRunCommand(confirmed = false): Promise<void> {
    if (!workspaceId || !command.trim()) {
      return
    }

    setBusy(true)
    setBottomTab('terminal')
    setBottomCollapsed(false)
    setError(null)
    appendOutput(`$ ${command.trim()}`)

    try {
      const result = await runCommand(workspaceId, command.trim(), confirmed)

      if (result.status === 409) {
        setConfirmRequired(true)
        setCommandOutput(JSON.stringify(result.payload, null, 2))
        appendOutput('Command requires explicit confirmation.')
        return
      }

      if (result.status >= 400) {
        setCommandOutput(JSON.stringify(result.payload, null, 2))
        appendOutput(`Command failed with status ${result.status}.`)
        return
      }

      setConfirmRequired(false)
      setCommandOutput(JSON.stringify(result.payload, null, 2))
      await refreshTree(workspaceId)
      appendOutput('Command finished.')
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleStartAgentRun(): Promise<void> {
    if (!workspaceId || !goal.trim()) {
      return
    }

    setBusy(true)
    setError(null)
    setBottomTab('agent')
    setBottomCollapsed(false)
    setEvents([])

    try {
      const request: AgentRunRequest = {
        workspaceId,
        goal: goal.trim(),
        mode,
        modelProfile: 'qwen3.5-9b-q4',
        autonomyLevel: 'full_autonomy',
        contextRefs: [],
      }

      const created = await startAgentRun(request)
      setRunId(created.runId)
      appendOutput(`Agent run started: ${created.runId}`)

      streamStopRef.current?.()
      streamStopRef.current = streamAgentRun(
        created.runId,
        (event) => {
          setEvents((current) => [...current, event])
          appendOutput(`Agent event: ${event.kind}`)

          if (event.kind === 'run.completed' || event.kind === 'run.failed' || event.kind === 'run.cancelled') {
            void refreshTree(workspaceId)
          }
        },
        (message) => {
          setError(message)
          appendOutput(message)
        },
      )
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelRun(): Promise<void> {
    if (!runId) {
      return
    }

    try {
      await cancelRun(runId)
      appendOutput(`Requested cancel for run ${runId}`)
    } catch (caught) {
      setError(asErrorMessage(caught))
    }
  }

  async function handleCreateCheckpoint(): Promise<void> {
    if (!workspaceId) {
      return
    }

    setBusy(true)
    try {
      const checkpoint = await createCheckpoint(workspaceId, 'Manual checkpoint from WebIDE UI')
      appendOutput(`Created checkpoint: ${checkpoint.id}`)
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleModelAction(action: 'ensure' | 'start' | 'stop'): Promise<void> {
    setBusy(true)
    setError(null)

    try {
      const next =
        action === 'ensure' ? await ensureModel() : action === 'start' ? await startModel() : await stopModel()
      setModelStatus(next)
      appendOutput(`Model action completed: ${action}`)
    } catch (caught) {
      setError(asErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const onEditorMount: OnMount = (editor) => {
    editor.onDidChangeCursorPosition((event) => {
      setCursorLabel(`Ln ${event.position.lineNumber}, Col ${event.position.column}`)
    })
  }

  if (initializing) {
    return <div className="boot-screen">Initializing WebIDE bridge connection...</div>
  }

  if (!bridgeOnline) {
    return (
      <div className="offline-screen">
        <h1>WebIDE Local Bridge Required</h1>
        <p>
          The web UI is online, but local runtime requires the localhost bridge at <code>http://127.0.0.1:4317</code>.
        </p>
        <div className="installer-grid">
          <a href="/installers/macos/install.sh" target="_blank" rel="noreferrer">
            macOS Installer Stub
          </a>
          <a href="/installers/linux/install.sh" target="_blank" rel="noreferrer">
            Linux Installer Stub
          </a>
          <a href="/installers/windows/install.ps1" target="_blank" rel="noreferrer">
            Windows Installer Stub
          </a>
        </div>
        <button type="button" onClick={() => void bootstrap()}>
          Retry Bridge Probe
        </button>
      </div>
    )
  }

  return (
    <div className="ide-root">
      <TitleBar
        projectName={activeWorkspace?.label ?? ''}
        paired={paired}
        runLabel={runLabel}
        onOpenCommandPalette={() => {
          setPaletteMode('commands')
          setPaletteQuery('')
          setPaletteOpen(true)
        }}
        onOpenQuickFile={() => {
          setPaletteMode('files')
          setPaletteQuery('')
          setPaletteOpen(true)
        }}
        onToggleExplorer={() => setExplorerVisible((current) => !current)}
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <div
        className={`ide-main ${explorerVisible ? '' : 'explorer-hidden'}`}
        style={
          {
            '--sidebar-width': `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <ActivityBar
          activeView={activeView}
          problemCount={errorCount + warningCount}
          onOpenProblems={() => {
            setBottomCollapsed(false)
            setBottomTab('problems')
          }}
          onOpenCommandPalette={() => {
            setPaletteMode('commands')
            setPaletteQuery('')
            setPaletteOpen(true)
          }}
          onSelectView={(view) => {
            setActiveView(view)
            setExplorerVisible(true)
          }}
        />

        <ExplorerPane
          activeView={activeView}
          visible={explorerVisible}
          workspaceInput={workspaceInput}
          onWorkspaceInputChange={setWorkspaceInput}
          onOpenWorkspace={() => {
            void handleOpenWorkspace()
          }}
          busy={busy}
          workspaces={workspaces}
          workspaceId={workspaceId}
          onSelectWorkspace={(id) => {
            setWorkspaceId(id)
            setOpenTabs([])
            setActiveFilePath(null)
            setFileContentsByPath({})
            setExpandedDirectories([])
            if (id) {
              void refreshTree(id)
            }
          }}
          fileFilter={fileFilter}
          onFileFilterChange={setFileFilter}
          files={filteredFiles}
          tree={tree}
          expandedDirectories={expandedDirectories}
          onToggleDirectory={handleToggleDirectory}
          selectedFile={activeFilePath}
          onSelectFile={(file) => {
            void handleSelectFile(file)
          }}
          openTabs={openTabs}
          onSelectEditorTab={(file) => {
            void handleSelectFile(file)
          }}
          onBeginResize={beginSidebarResize}
        />

        <section className="workbench">
          <EditorTabs
            tabs={openTabs}
            activePath={activeFilePath}
            onSelectTab={(pathValue) => {
              setActiveFilePath(pathValue)
              expandDirectoriesForPath(pathValue)
              setOpenTabs((current) =>
                current.map((tab) => ({
                  ...tab,
                  active: tab.path === pathValue,
                })),
              )
            }}
            onCloseTab={handleCloseTab}
          />

          <section className="editor-surface">
            <div className="breadcrumbs-bar">
              {activeFilePath ? (
                breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb}-${index}`} className="crumb">
                    {index > 0 ? <span className="codicon codicon-chevron-right" /> : null}
                    <span>{crumb}</span>
                  </span>
                ))
              ) : (
                <span className="crumb muted">No active file</span>
              )}
            </div>

            {activeFilePath ? (
              <Editor
                theme="vs-dark"
                height="calc(100% - 28px)"
                language={guessLanguage(activeFilePath)}
                value={activeFileContent}
                onChange={handleEditorChange}
                onMount={onEditorMount}
                options={{
                  minimap: { enabled: true },
                  fontSize: 13,
                  fontFamily: "Consolas, 'Courier New', monospace",
                  lineHeight: 20,
                  lineNumbersMinChars: 3,
                  wordWrap: 'off',
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'blink',
                  renderWhitespace: 'selection',
                  overviewRulerBorder: false,
                  fixedOverflowWidgets: true,
                  automaticLayout: true,
                }}
              />
            ) : (
              <div className="editor-empty">
                <p>No file open.</p>
                <small>Open a file from Explorer or press Ctrl+P.</small>
              </div>
            )}
          </section>

          <BottomPanel
            activeTab={bottomTab}
            onTabChange={setBottomTab}
            collapsed={bottomCollapsed}
            onToggleCollapsed={() => setBottomCollapsed((current) => !current)}
            height={bottomPanelHeight}
            onHeightChange={setBottomPanelHeight}
            terminalInputRef={terminalInputRef}
            command={command}
            onCommandChange={setCommand}
            commandOutput={commandOutput}
            confirmRequired={confirmRequired}
            busy={busy}
            workspaceReady={Boolean(workspaceId)}
            onRunCommand={(confirmed) => {
              void handleRunCommand(confirmed)
            }}
            goal={goal}
            onGoalChange={setGoal}
            mode={mode}
            onModeChange={setMode}
            onStartRun={() => {
              void handleStartAgentRun()
            }}
            onCancelRun={() => {
              void handleCancelRun()
            }}
            runId={runId}
            events={events}
            outputLog={outputLog}
            problems={problems}
          />
        </section>
      </div>

      <StatusBar
        workspaceLabel={activeWorkspace?.label ?? 'No Workspace'}
        modelLabel={modelStatus?.serving ? 'Model Running' : modelStatus?.installed ? 'Model Installed' : 'Model Missing'}
        runLabel={`Run ${runLabel}`}
        cursorLabel={cursorLabel}
        activeBottomTab={bottomTab}
        errorCount={errorCount}
        warningCount={warningCount}
        languageLabel={activeFilePath ? guessLanguage(activeFilePath).toUpperCase() : 'PLAINTEXT'}
      />

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        query={paletteQuery}
        onQueryChange={setPaletteQuery}
        actions={commandActions}
        files={fileList}
        onExecuteAction={(action) => action.run()}
        onSelectFile={(file) => {
          void handleSelectFile(file)
        }}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  )
}

function flattenFiles(node: WorkspaceTreeNode | null): string[] {
  if (!node) {
    return []
  }

  const files: string[] = []

  const walk = (current: WorkspaceTreeNode): void => {
    if (current.type === 'file') {
      if (current.path && current.path !== '.') {
        files.push(current.path)
      }
      return
    }

    for (const child of current.children ?? []) {
      walk(child)
    }
  }

  walk(node)
  return files.sort((a, b) => a.localeCompare(b))
}

function guessLanguage(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.html')) return 'html'

  return 'plaintext'
}

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message
  }

  return 'Unknown error'
}

function fileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}
