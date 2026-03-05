import { Bot, FileCode2, FolderTree, Play, Search, TerminalSquare } from 'lucide-react'

const openTabs = ['main.ts', 'agent.ts', 'README.md']
const fileTree = ['src/', 'src/main.ts', 'src/agent.ts', 'src/lib/', 'README.md', 'package.json']

export function WebIDEPage() {
  return (
    <div className="flex h-full flex-col bg-[#1e1e1e] text-[#d4d4d4]">
      <header className="flex h-10 items-center justify-between border-b border-[#2d2d2d] bg-[#181818] px-3 text-sm">
        <div className="font-medium text-[#c5c5c5]">WebIDE</div>
        <div className="text-xs text-[#8f8f8f]">Step 1: IDE Page Shell</div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-12 flex-col items-center gap-2 border-r border-[#2d2d2d] bg-[#252526] py-3">
          <button className="rounded p-2 text-[#c5c5c5] hover:bg-[#2f2f2f]" type="button">
            <FolderTree size={18} />
          </button>
          <button className="rounded p-2 text-[#8f8f8f] hover:bg-[#2f2f2f]" type="button">
            <Search size={18} />
          </button>
          <button className="rounded p-2 text-[#8f8f8f] hover:bg-[#2f2f2f]" type="button">
            <Play size={18} />
          </button>
          <button className="rounded p-2 text-[#8f8f8f] hover:bg-[#2f2f2f]" type="button">
            <Bot size={18} />
          </button>
        </aside>

        <aside className="hidden w-64 flex-col border-r border-[#2d2d2d] bg-[#252526] md:flex">
          <div className="border-b border-[#2d2d2d] px-3 py-2 text-xs font-semibold tracking-wide text-[#9d9d9d]">EXPLORER</div>
          <div className="space-y-1 p-2 text-sm">
            {fileTree.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-[#2a2d2e]">
                <FileCode2 size={14} className="text-[#6ea0f8]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 items-center border-b border-[#2d2d2d] bg-[#2d2d2d]">
            {openTabs.map((tab, index) => (
              <button
                key={tab}
                className={`h-full border-r border-[#3a3a3a] px-4 text-sm ${index === 0 ? 'bg-[#1e1e1e] text-[#fff]' : 'text-[#9d9d9d]'}`}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[#1e1e1e] p-4 font-mono text-sm leading-6 text-[#d4d4d4]">
            <pre className="m-0 whitespace-pre-wrap">
{`// Welcome to WebIDE
// Next step: wire real file tree, monaco editor, and agent actions.

export async function runAgent(goal: string) {
  console.log('Goal:', goal)
  return { ok: true }
}
`}
            </pre>
          </div>
        </main>

        <aside className="hidden w-80 border-l border-[#2d2d2d] bg-[#252526] xl:flex xl:flex-col">
          <div className="border-b border-[#2d2d2d] px-3 py-2 text-xs font-semibold tracking-wide text-[#9d9d9d]">AGENT</div>
          <div className="space-y-3 p-3 text-sm">
            <div className="rounded border border-[#3a3a3a] bg-[#1f1f1f] p-3">
              <div className="text-[#9cdcfe]">Agent Plan</div>
              <div className="mt-2 text-[#c5c5c5]">1. Read files</div>
              <div className="text-[#c5c5c5]">2. Propose patch</div>
              <div className="text-[#c5c5c5]">3. Run tests</div>
            </div>
            <div className="rounded border border-[#3a3a3a] bg-[#1f1f1f] p-3 text-[#9d9d9d]">No active run yet.</div>
          </div>
        </aside>
      </div>

      <section className="flex h-44 flex-col border-t border-[#2d2d2d] bg-[#1f1f1f]">
        <div className="flex h-8 items-center gap-3 border-b border-[#2d2d2d] px-3 text-xs">
          <button className="font-semibold text-[#fff]" type="button">
            <span className="inline-flex items-center gap-1">
              <TerminalSquare size={13} />
              TERMINAL
            </span>
          </button>
          <button className="text-[#9d9d9d]" type="button">
            PROBLEMS
          </button>
          <button className="text-[#9d9d9d]" type="button">
            OUTPUT
          </button>
        </div>
        <div className="overflow-auto p-3 font-mono text-xs text-[#7fba7a]">$ webide ready</div>
      </section>

      <footer className="flex h-6 items-center justify-between bg-[#007acc] px-3 text-xs text-white">
        <span>main</span>
        <span>UTF-8 • TypeScript • Ln 1, Col 1</span>
      </footer>
    </div>
  )
}
