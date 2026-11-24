export type MedalTier = 1 | 2 | 3

const TIERS: Record<MedalTier, { label: string; face: string; shade: string; shine: string; ribbon: string; ribbonDark: string }> = {
  1: { label: 'Gold medal', face: '#ffc93a', shade: '#b8860b', shine: '#fff3b0', ribbon: '#c8362a', ribbonDark: '#7d1f17' },
  2: { label: 'Silver medal', face: '#d7dbe0', shade: '#8a9099', shine: '#ffffff', ribbon: '#2d5a8a', ribbonDark: '#1a3757' },
  3: { label: 'Bronze medal', face: '#d98a4a', shade: '#8f5226', shine: '#ffc99a', ribbon: '#3f7a3a', ribbonDark: '#24481f' },
}

// 16x16 pixel art, one string per row.
// r = ribbon, d = ribbon shade, o = rim shade, f = face, s = shine, n = rank numeral, . = empty.
const BASE = [
  '...rrd....drr...',
  '...rrdd..ddrr...',
  '....rrd..drr....',
  '....rrddddrr....',
  '.....rrddrr.....',
  '......oooo......',
  '....oossffoo....',
  '...ossffffffo...',
  '...osffffffffo..',
  '..osffffffffffo.',
  '..offfffffffffo.',
  '..offfffffffffo.',
  '...offfffffffo..',
  '...oofffffffoo..',
  '.....ooooooo....',
  '................',
]

// 3x5 numerals stamped in the middle of the face (columns 6-8, rows 8-12).
const NUMERALS: Record<MedalTier, string[]> = {
  1: ['.n.', 'nn.', '.n.', '.n.', 'nnn'],
  2: ['nn.', '..n', '.n.', 'n..', 'nnn'],
  3: ['nn.', '..n', '.n.', '..n', 'nn.'],
}

/** A pixel-art medal with a ribbon, numbered 1-3 in gold, silver or bronze. */
export function Medal({ tier, className = 'size-14' }: { tier: MedalTier; className?: string }) {
  const t = TIERS[tier]
  const art = BASE.map((row) => [...row])
  NUMERALS[tier].forEach((row, y) => [...row].forEach((ch, x) => ch === 'n' && (art[8 + y][6 + x] = 'n')))
  const fill: Record<string, string> = { r: t.ribbon, d: t.ribbonDark, o: t.shade, f: t.face, s: t.shine, n: t.shade }

  return (
    <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" role="img" aria-label={t.label}>
      {art.flatMap((row, y) =>
        row.map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill[ch]} />)),
      )}
    </svg>
  )
}
