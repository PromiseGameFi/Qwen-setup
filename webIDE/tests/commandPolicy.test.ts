import { describe, expect, it } from 'vitest'

import { evaluateCommandPolicy } from '../services/bridge/src/commandPolicy'

describe('evaluateCommandPolicy', () => {
  it('denies dangerous commands', () => {
    const decision = evaluateCommandPolicy('rm -rf /')
    expect(decision.action).toBe('deny')
  })

  it('requires confirmation for package installs', () => {
    const decision = evaluateCommandPolicy('npm install express')
    expect(decision.action).toBe('confirm')
  })

  it('allows safe test commands', () => {
    const decision = evaluateCommandPolicy('npm test')
    expect(decision.action).toBe('allow')
  })
})
