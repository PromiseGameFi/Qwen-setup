import { useEffect, useMemo, useState } from 'react'

import type { CommandPaletteAction } from '../types/ui'

interface CommandPaletteProps {
  open: boolean
  mode: 'commands' | 'files'
  query: string
  onQueryChange: (value: string) => void
  actions: CommandPaletteAction[]
  files: string[]
  onExecuteAction: (action: CommandPaletteAction) => void
  onSelectFile: (file: string) => void
  onClose: () => void
}

export function CommandPalette({
  open,
  mode,
  query,
  onQueryChange,
  actions,
  files,
  onExecuteAction,
  onSelectFile,
  onClose,
}: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (mode === 'files') {
      return files
        .filter((file) => file.toLowerCase().includes(normalized))
        .slice(0, 80)
        .map((file) => ({
          id: file,
          label: file,
          icon: 'codicon-file',
          type: 'file' as const,
        }))
    }

    return actions
      .filter((action) => action.label.toLowerCase().includes(normalized))
      .map((action) => ({
        id: action.id,
        label: action.label,
        shortcut: action.shortcut,
        icon: action.icon ?? 'codicon-symbol-method',
        type: 'action' as const,
        action,
      }))
  }, [actions, files, mode, query])

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedIndex(0)
  }, [open, mode, query])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((current) => Math.min(items.length - 1, current + 1))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((current) => Math.max(0, current - 1))
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const selected = items[selectedIndex]
        if (!selected) {
          return
        }

        if (selected.type === 'file') {
          onSelectFile(selected.label)
          onClose()
          return
        }

        onExecuteAction(selected.action)
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [items, onClose, onExecuteAction, onSelectFile, open, selectedIndex])

  if (!open) {
    return null
  }

  return (
    <div className="command-palette-overlay" role="presentation" onClick={onClose}>
      <div className="command-palette" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="palette-mode">
          {mode === 'files' ? (
            <span>
              <span className="codicon codicon-go-to-file" /> Quick Open
            </span>
          ) : (
            <span>
              <span className="codicon codicon-terminal-cmd" /> Command Palette
            </span>
          )}
        </div>
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={mode === 'files' ? 'Type to open file...' : 'Type a command...'}
        />

        <div className="palette-list">
          {items.map((item, index) => (
            <button
              key={item.id}
              className={index === selectedIndex ? 'active' : ''}
              type="button"
              onClick={() => {
                if (item.type === 'file') {
                  onSelectFile(item.label)
                  onClose()
                  return
                }

                onExecuteAction(item.action)
                onClose()
              }}
            >
              <span className="palette-item-main">
                <span className={`codicon ${item.icon}`} />
                <span>{item.label}</span>
              </span>
              {'shortcut' in item && item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
            </button>
          ))}

          {items.length === 0 ? <p className="palette-empty">No results.</p> : null}
        </div>
      </div>
    </div>
  )
}
