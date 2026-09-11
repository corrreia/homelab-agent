import { useState } from 'react'

/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS, or localhost), and this app is
 * routinely reached over plain HTTP on a LAN IP — where it is simply `undefined` and an
 * optional-chained call fails silently. Fall back to the legacy selection copy there, and
 * report failure so the UI can say so instead of pretending it worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)

      return true
    } catch {
      // Blocked or denied — fall through to the selection-based copy.
    }
  }

  const area = document.createElement('textarea')

  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  document.body.append(area)
  area.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

export interface CopyState {
  /** Which button was pressed, so several can share one hook. */
  key: string
  ok: boolean
}

/** Copy-to-clipboard with a short-lived "Copied" / "Copy failed" label per button. */
export function useCopy() {
  const [state, setState] = useState<CopyState | null>(null)

  const copy = async (key: string, text: string) => {
    const ok = await copyText(text)

    setState({ key, ok })
    setTimeout(() => setState(null), 1800)
  }

  return { copy, state }
}

/** Label for a copy button: its normal text until it is pressed. */
export function copyLabel(state: CopyState | null, key: string, idle: string): string {
  if (state?.key !== key) return idle

  return state.ok ? 'Copied' : 'Copy failed'
}
