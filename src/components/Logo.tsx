import type { CSSProperties } from 'react'

export function Logo({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Homelab Agent"
      style={style}
    >
      <g stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" opacity={0.55} fill="none">
        <line x1="32" y1="32" x2="32" y2="9" />
        <line x1="32" y1="32" x2="52" y2="20" />
        <line x1="32" y1="32" x2="52" y2="44" />
        <line x1="32" y1="32" x2="32" y2="55" />
        <line x1="32" y1="32" x2="12" y2="44" />
        <line x1="32" y1="32" x2="12" y2="20" />
      </g>
      <g fill="currentColor">
        <circle cx="32" cy="9" r={3.25} />
        <circle cx="52" cy="20" r={3.25} />
        <circle cx="52" cy="44" r={3.25} />
        <circle cx="32" cy="55" r={3.25} />
        <circle cx="12" cy="44" r={3.25} />
        <circle cx="12" cy="20" r={3.25} />
      </g>
      <rect x="20" y="20" width="24" height="24" rx={5} fill="currentColor" />
      <g stroke="#0f1117" strokeWidth={2.25} strokeLinecap="round">
        <line x1="25.5" y1="27" x2="38.5" y2="27" />
        <line x1="25.5" y1="32" x2="38.5" y2="32" />
        <line x1="25.5" y1="37" x2="38.5" y2="37" />
      </g>
    </svg>
  )
}
