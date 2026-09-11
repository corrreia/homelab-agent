import { colors, fonts } from '../styles'

const button = {
  borderRadius: '6px',
  padding: '0.5rem 0.9rem',
  fontSize: '0.85rem',
  fontFamily: fonts.body,
  fontWeight: 500,
  cursor: 'pointer',
} as const

/**
 * Inline two-step confirmation for a destructive action. Renders in place of a row's own
 * buttons — the project's stand-in for `window.confirm()`, which blocks the page, can't be
 * styled, and is suppressible by the browser.
 */
export function ConfirmStrip(props: {
  question: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="group"
      aria-label={props.question}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}
    >
      <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{props.question}</span>
      <button
        type="button"
        onClick={props.onConfirm}
        style={{ ...button, background: colors.error, color: colors.bg, border: 'none' }}
      >
        {props.confirmLabel}
      </button>
      <button
        type="button"
        onClick={props.onCancel}
        style={{
          ...button,
          background: 'transparent',
          color: colors.textMuted,
          border: `1px solid ${colors.border}`,
        }}
      >
        Cancel
      </button>
    </div>
  )
}
