// Slug helper for the add-service forms. Pure, so it unit-tests directly.

/** First free slug of the form `base`, `base-2`, `base-3`, … */
export function suggestSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base

  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`

    if (!existing.includes(candidate)) return candidate
  }

  return base
}
