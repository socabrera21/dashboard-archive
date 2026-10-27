import type { ImprovementStatus, Lifecycle, Purpose, Where } from '../src/types.js'

const PURPOSE_RULES: Array<{ purpose: Purpose; pattern: RegExp }> = [
  { purpose: 'experiment', pattern: /reddit|hacks|experiment|sandbox/i },
  { purpose: 'tooling', pattern: /\b(coverage|lint|tooling)\b/i },
  { purpose: 'one-pager', pattern: /one[\s_-]?pager|cheat[\s_-]?sheet/i },
  { purpose: 'talk-track', pattern: /talk[\s_-]?track|call[\s_-]?script/i },
  { purpose: 'battlecard', pattern: /battlecard|competitive/i },
  { purpose: 'playbook', pattern: /playbook|guide/i },
  { purpose: 'cockpit', pattern: /cockpit|dashboard|hub/i },
]

function matchPurpose(text: string): Purpose | null {
  return PURPOSE_RULES.find((rule) => rule.pattern.test(text))?.purpose ?? null
}

export function derivePurpose(entryPath: string, title: string, headings: string[]): Purpose {
  return matchPurpose(entryPath) ?? matchPurpose(`${title} ${headings.join(' ')}`) ?? 'uncategorized'
}

export function deriveWhere(root: string): Where {
  const lower = root.toLowerCase()
  if (lower.includes('second-brain') || lower.includes('obsidian')) return 'vault'
  if (lower.includes('desktop')) return 'desktop'
  if (lower.includes('mobile documents')) return 'icloud'
  return 'documents'
}

export function deriveLifecycle(entryPath: string, improvementStatus: ImprovementStatus, confidence: number): Lifecycle {
  if (/archive|legacy|_archive|old-/i.test(entryPath)) return 'archived'
  if (improvementStatus === 'planned' || improvementStatus === 'in-progress' || confidence < 0.5) return 'draft'
  return 'live'
}
