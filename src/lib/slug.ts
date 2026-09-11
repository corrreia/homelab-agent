// Slug helpers shared by the service and host forms. Pure, so they unit-test directly.

/**
 * Turn free text into a slug the repos will accept: `^[a-z0-9][a-z0-9-]*$`.
 * Accents are folded ("Tomás" → "tomas") rather than dropped, and anything else becomes a
 * single hyphen. Returns '' when nothing usable survives, which callers treat as "no suggestion".
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[̀-ͯ]/g, '') // strip the combining marks NFKD split off
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^[^a-z0-9]+|-+$/g, '') // must start alphanumeric, must not trail a hyphen
}

/** First free slug of the form `base`, `base-2`, `base-3`, … */
export function suggestSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base

  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`

    if (!existing.includes(candidate)) return candidate
  }

  return base
}

/** Slug suggested for a label, deduped against slugs already in use. '' when the label yields nothing. */
export function slugForLabel(label: string, existing: string[]): string {
  const base = slugify(label)

  return base === '' ? '' : suggestSlug(base, existing)
}
