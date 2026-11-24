/** The guardians' badge: a pixel cog with a sprout, stamped in brass. */
export function Seal({ className = 'size-12' }: { className?: string }) {
  // 16x16 pixel art, one string per row. c = cog, g = sprout, . = empty.
  const art = [
    '......cccc......',
    '...cc.cccc.cc...',
    '..cccccccccccc..',
    '..ccc......ccc..',
    '.ccc...gg...ccc.',
    'cccc..gggg..cccc',
    'ccc....gg....ccc',
    'ccc..g.gg.g..ccc',
    'ccc..gggggg..ccc',
    'ccc....gg....ccc',
    'cccc...gg...cccc',
    '.ccc...gg...ccc.',
    '..ccc......ccc..',
    '..cccccccccccc..',
    '...cc.cccc.cc...',
    '......cccc......',
  ]
  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
      {art.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={ch === 'c' ? 'var(--stamp)' : 'var(--phos)'} />
          ),
        ),
      )}
    </svg>
  )
}

/** A glowing vacuum tube, for the console's exposed-hardware look. */
export function Tube({ className = 'h-24 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 96" className={className} aria-hidden="true">
      {/* glass */}
      <path d="M8 70 V24 C8 10 32 10 32 24 V70Z" fill="rgb(255 190 120 / 0.10)" stroke="#c9b89a" strokeOpacity="0.5" strokeWidth="1.5" />
      {/* glow */}
      <ellipse cx="20" cy="46" rx="9" ry="16" fill="#ff9a2e" opacity="0.35" className="animate-flicker" />
      {/* plates + filament */}
      <rect x="13" y="32" width="14" height="26" fill="none" stroke="#6a6a5a" strokeWidth="1.5" />
      <path d="M17 58 V38 L20 34 L23 38 V58" fill="none" stroke="#ffd27a" strokeWidth="1.5" />
      <path d="M12 22 C16 18 24 18 28 22" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
      {/* base */}
      <rect x="5" y="70" width="30" height="12" fill="var(--metal-lo)" stroke="var(--edge)" strokeWidth="2" />
      <rect x="9" y="82" width="22" height="8" fill="#2b2a20" stroke="var(--edge)" strokeWidth="2" />
      <path d="M13 90 V96 M20 90 V96 M27 90 V96" stroke="#8c8a6b" strokeWidth="2" />
    </svg>
  )
}

/** Bundle of loose wires hanging off a panel edge. */
export function Wires({ className = 'h-16 w-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 112 64" className={className} aria-hidden="true" fill="none" strokeWidth="3" strokeLinecap="round">
      <path d="M4 0 C10 30 30 40 40 64" stroke="#8b2a1c" />
      <path d="M14 0 C20 26 46 30 60 60" stroke="#c9a227" />
      <path d="M24 0 C40 30 70 20 84 56" stroke="#2d5a8a" />
      <path d="M34 0 C50 20 90 16 108 40" stroke="#4a4a40" />
    </svg>
  )
}
