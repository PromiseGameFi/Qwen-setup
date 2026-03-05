import type { CommandPolicyDecision } from '@webide/protocol'

const denyPatterns: Array<[RegExp, string, string]> = [
  [/\brm\s+-rf\s+\//i, 'deny-destructive-root', 'Destructive root deletion command is blocked.'],
  [/\bsudo\b/i, 'deny-privileged', 'Privileged commands are blocked in sandboxed runner.'],
  [/\b(?:curl|wget)\b.+\|\s*(?:bash|sh|zsh)/i, 'deny-pipe-shell', 'Piped remote shell commands are blocked.'],
  [/\b(?:scp|rsync)\b.+@/i, 'deny-exfil', 'Potential data exfiltration command blocked.'],
]

const confirmPatterns: Array<[RegExp, string, string]> = [
  [/\bnpm\s+(?:install|i)\b/i, 'confirm-npm-install', 'Package installation needs confirmation.'],
  [/\bpnpm\s+(?:add|install)\b/i, 'confirm-pnpm-install', 'Package installation needs confirmation.'],
  [/\bpip\s+install\b/i, 'confirm-pip-install', 'Python package installation needs confirmation.'],
  [/\bcargo\s+add\b/i, 'confirm-cargo-add', 'Dependency addition needs confirmation.'],
  [/\bgo\s+get\b/i, 'confirm-go-get', 'Dependency fetch needs confirmation.'],
  [/\bgit\s+clean\b/i, 'confirm-git-clean', 'Potentially destructive git clean needs confirmation.'],
  [/\bnpm\s+run\s+build\b/i, 'confirm-long-build', 'Long-running build should be confirmed.'],
]

const allowPatterns: Array<[RegExp, string, string]> = [
  [/\b(?:npm\s+run\s+)?test\b/i, 'allow-test', 'Test command is allowed.'],
  [/\b(?:npm\s+run\s+)?lint\b/i, 'allow-lint', 'Lint command is allowed.'],
  [/\b(?:npm\s+run\s+)?format\b/i, 'allow-format', 'Formatter command is allowed.'],
  [/\b(?:cat|ls|pwd|echo|head|tail|grep|rg)\b/i, 'allow-read', 'Read-only shell command is allowed.'],
]

export function evaluateCommandPolicy(command: string): CommandPolicyDecision {
  const normalized = command.trim()
  if (!normalized) {
    return {
      action: 'deny',
      ruleId: 'deny-empty',
      reason: 'Empty command is not allowed.',
    }
  }

  for (const [pattern, ruleId, reason] of denyPatterns) {
    if (pattern.test(normalized)) {
      return {
        action: 'deny',
        ruleId,
        reason,
      }
    }
  }

  for (const [pattern, ruleId, reason] of confirmPatterns) {
    if (pattern.test(normalized)) {
      return {
        action: 'confirm',
        ruleId,
        reason,
      }
    }
  }

  for (const [pattern, ruleId, reason] of allowPatterns) {
    if (pattern.test(normalized)) {
      return {
        action: 'allow',
        ruleId,
        reason,
      }
    }
  }

  return {
    action: 'confirm',
    ruleId: 'confirm-default',
    reason: 'Command is not on allowlist; explicit confirmation required.',
  }
}

export function evaluateNetworkAllowlist(
  command: string,
  allowlist: string[],
): CommandPolicyDecision | null {
  const hosts = extractHosts(command)
  if (hosts.length === 0) {
    return null
  }

  for (const host of hosts) {
    const allowed = allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`))
    if (!allowed) {
      return {
        action: 'deny',
        ruleId: 'deny-network-host',
        reason: `Network host ${host} is not in WEBIDE_NETWORK_ALLOWLIST.`,
      }
    }
  }

  return null
}

function extractHosts(command: string): string[] {
  const matches = command.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)
  const hosts = new Set<string>()

  for (const match of matches) {
    const host = match[1]?.toLowerCase()
    if (host) {
      hosts.add(host)
    }
  }

  return Array.from(hosts)
}
