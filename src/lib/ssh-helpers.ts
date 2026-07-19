// Pure helpers for the SSH tools — no I/O, so they unit-test without a live connection.

/** Single-quote a shell argument safely (for the find/grep commands we build). */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Render file content as numbered lines, like the agent Read tool / `cat -n`.
 * `offset` is a 1-based starting line (default 1); `limit` caps the line count.
 */
export function formatNumberedLines(content: string, offset = 1, limit?: number): string {
  const lines = content.split('\n')
  const start = Math.max(0, offset - 1)
  const end = limit != null ? start + limit : lines.length
  return lines
    .slice(start, end)
    .map((line, i) => `${String(start + i + 1).padStart(6)}\t${line}`)
    .join('\n')
}

export interface EditResult {
  result: string
  replacements: number
}

/**
 * Exact-string replace, like the agent Edit tool: `old_string` must occur exactly once
 * unless `replaceAll`. Throws a model-actionable error otherwise.
 */
export function applyEdit(content: string, oldString: string, newString: string, replaceAll = false): EditResult {
  if (oldString === newString) throw new Error('old_string and new_string are identical')
  const occurrences = oldString === '' ? 0 : content.split(oldString).length - 1
  if (occurrences === 0) throw new Error('old_string not found in file')
  if (occurrences > 1 && !replaceAll) {
    throw new Error(`old_string is not unique (${occurrences} matches); add surrounding context or pass replace_all`)
  }
  return {
    result: replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString),
    replacements: replaceAll ? occurrences : 1,
  }
}

/** Build a `find` command for a glob. The last path segment becomes `-name`; find recurses. */
export function buildFindCommand(pattern: string, path = '.'): string {
  const namePattern = pattern.includes('/') ? pattern.slice(pattern.lastIndexOf('/') + 1) : pattern
  return `find ${shellQuote(path)} -type f -name ${shellQuote(namePattern)} 2>/dev/null`
}

/** Build a content search that prefers ripgrep and falls back to `grep -rn`. */
export function buildGrepCommand(
  pattern: string,
  opts: { path?: string; glob?: string; ignoreCase?: boolean } = {},
): string {
  const path = opts.path ?? '.'
  const i = opts.ignoreCase ? ' -i' : ''
  const rgGlob = opts.glob ? ` -g ${shellQuote(opts.glob)}` : ''
  const grepInclude = opts.glob ? ` --include=${shellQuote(opts.glob)}` : ''
  const rg = `rg --line-number --no-heading${i}${rgGlob} -e ${shellQuote(pattern)} ${shellQuote(path)}`
  const grep = `grep -rn${i}${grepInclude} -e ${shellQuote(pattern)} ${shellQuote(path)}`
  return `if command -v rg >/dev/null 2>&1; then ${rg}; else ${grep}; fi`
}

export type HostKeyVerdict = 'match' | 'mismatch' | 'new'

/** TOFU decision for a presented server host key against the pinned one. */
export function classifyHostKey(pinned: string | undefined, presented: string): HostKeyVerdict {
  if (!pinned) return 'new'
  return pinned === presented ? 'match' : 'mismatch'
}
