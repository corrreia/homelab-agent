import { colors } from '../styles'

/**
 * An on/off switch. `label` says what it controls, for screen readers and as the tooltip; the
 * state itself shows as the track colour and the knob's side.
 */
export function Switch({
  checked,
  label,
  busy,
  onChange,
}: {
  checked: boolean
  label: string
  busy?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 34,
        height: 20,
        flexShrink: 0,
        padding: 0,
        border: 'none',
        borderRadius: 10,
        background: checked ? colors.success : colors.border,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'background 120ms',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 120ms',
        }}
      />
    </button>
  )
}
