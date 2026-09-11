import { colors, fonts } from '../styles'

/** Section title with its item count and an optional action on the right (e.g. "+ Add host"). */
export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string
  count?: number
  action?: { label: string; onClick: () => void } | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.textDim,
          fontWeight: 600,
        }}
      >
        {title}
        {count !== undefined && <span style={{ marginLeft: '0.4rem', color: colors.textDim }}>({count})</span>}
      </h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            fontFamily: fonts.body,
            fontSize: '0.8rem',
            padding: '2px 4px',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
