import { describe, expect, it } from 'vitest'
import { deriveLifecycle, derivePurpose, deriveWhere } from '../electron/categorize.ts'

describe('purpose, location, and lifecycle categorization', () => {
  it('matches purpose from the containing folder before falling back to title', () => {
    expect(derivePurpose('/Dashboards/cockpits/index.html', 'Untitled', [])).toBe('cockpit')
    expect(derivePurpose('/Talk Tracks/07 Full Platform/index.html', 'Untitled', [])).toBe('talk-track')
    expect(derivePurpose('/Resources/Playbooks/discovery.html', 'Untitled', [])).toBe('playbook')
    expect(derivePurpose('/Competitive/battlecard-acme.html', 'Untitled', [])).toBe('battlecard')
    expect(derivePurpose('/Sheets/product-cheatsheet.html', 'Untitled', [])).toBe('one-pager')
    expect(derivePurpose('/coverage/lcov-report/index.html', 'Untitled', [])).toBe('tooling')
    expect(derivePurpose('/experiment-samples/index.html', 'Untitled', [])).toBe('experiment')
  })

  it('falls back to title and headings when the folder gives no signal', () => {
    expect(derivePurpose('/misc/page.html', 'Example Dashboard', [])).toBe('cockpit')
    expect(derivePurpose('/misc/page.html', 'Untitled', ['Competitive Battlecard'])).toBe('battlecard')
  })

  it('returns uncategorized when nothing matches', () => {
    expect(derivePurpose('/misc/page.html', 'Untitled', [])).toBe('uncategorized')
  })

  it('derives where from the scan root path', () => {
    expect(deriveWhere('/Users/example/Library/Mobile Documents/iCloud~md~obsidian/Documents/second-brain')).toBe('vault')
    expect(deriveWhere('/Users/example/Desktop')).toBe('desktop')
    expect(deriveWhere('/Users/example/Library/Mobile Documents/com~apple~CloudDocs')).toBe('icloud')
    expect(deriveWhere('/Users/example/Documents')).toBe('documents')
  })

  it('marks archived paths regardless of confidence', () => {
    expect(deriveLifecycle('/Archive/Legacy/old-report.html', 'none', 0.95)).toBe('archived')
  })

  it('marks low-confidence or in-progress work as draft', () => {
    expect(deriveLifecycle('/work/page.html', 'none', 0.3)).toBe('draft')
    expect(deriveLifecycle('/work/page.html', 'in-progress', 0.9)).toBe('draft')
  })

  it('defaults to live', () => {
    expect(deriveLifecycle('/work/page.html', 'none', 0.9)).toBe('live')
  })
})
