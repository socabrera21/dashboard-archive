import path from 'node:path'

export function isWithinApprovedRoots(candidate: string, roots: string[]): boolean {
  const resolved = path.resolve(candidate)
  return roots.some((root) => {
    const relative = path.relative(path.resolve(root), resolved)
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  })
}

export function requireDashboardPath(candidate: string, roots: string[]): string {
  if (!isWithinApprovedRoots(candidate, roots)) throw new Error('Path is outside approved scan roots')
  return path.resolve(candidate)
}
