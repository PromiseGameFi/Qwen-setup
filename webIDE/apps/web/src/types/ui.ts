export type ViewId = 'explorer' | 'search' | 'scm' | 'run' | 'extensions'

export type AssistantTabId = 'chat' | 'composer' | 'context'

export type BottomTabId =
  | 'terminal'
  | 'agent'
  | 'output'
  | 'problems'
  | 'debug_console'
  | 'ports'

export interface OpenEditorTab {
  path: string
  title: string
  dirty: boolean
  active: boolean
}

export interface ProblemItem {
  source: 'terminal' | 'agent'
  severity: 'error' | 'warning'
  file?: string
  message: string
  line?: number
}

export interface CommandPaletteAction {
  id: string
  label: string
  shortcut?: string
  icon?: string
  run: () => void
}
