import { describe, expect, it } from 'vitest'
import { isWithinApprovedRoots, requireDashboardPath } from '../electron/security.ts'

describe('filesystem authorization', () => {
  const roots = ['/Users/example/Documents', '/Users/example/Library/Mobile Documents/com~apple~CloudDocs']

  it('allows descendants of approved roots', () => {
    expect(isWithinApprovedRoots('/Users/example/Documents/dashboards/index.html', roots)).toBe(true)
  })

  it('rejects sibling paths that only share a string prefix', () => {
    expect(isWithinApprovedRoots('/Users/example/Documents-private/secret.html', roots)).toBe(false)
  })

  it('throws before native actions use an unauthorized path', () => {
    expect(() => requireDashboardPath('/tmp/escape.html', roots)).toThrow('outside approved scan roots')
  })

  it('rejects a mirror path outside the approved roots even if it looks plausible', () => {
    expect(() => requireDashboardPath('/Users/example/Library/Mobile Documents/com~apple~CloudDocs/../../../etc/passwd', roots)).toThrow('outside approved scan roots')
  })
})
