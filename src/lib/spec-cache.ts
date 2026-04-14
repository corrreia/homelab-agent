import type { MergeResult } from './spec-merger'

let cached: MergeResult | null = null

export function getCachedMergedSpec(): MergeResult | null {
  return cached
}

export function setCachedMergedSpec(result: MergeResult): void {
  cached = result
}

export function invalidateMergedSpecCache(): void {
  cached = null
}
