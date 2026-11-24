import { Tip } from '#/components/ui/Tooltip.tsx'
import { PERSON_STATUS_META, WANTED_HEAT, type PersonStatus } from '#/lib/persons.ts'

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Photo-less ID badge: a 7×7 mirrored pixel face seeded by the person id,
 * like the placeholder a cheap terminal prints when the photo is missing.
 * Erased records print solid black.
 */
export function IdBadge({ personId, status, size = 72 }: { personId: string; status: PersonStatus; size?: number }) {
  const erased = status === 'ERASED'
  const h = hash(personId)
  const cells: [number, number][] = []
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 4; x++) {
      const bit = (h >>> ((y * 4 + x) % 31)) & 1
      // Keep a head shape: always fill the middle, never the corners.
      const corner = (y === 0 || y === 6) && x === 0
      if (corner || !(bit || (x === 3 && y > 0 && y < 6))) continue
      cells.push([x, y])
      if (x !== 3) cells.push([6 - x, y])
    }
  }
  const ink = erased ? '#0b0703' : status === 'WANTED' ? '#ff8a6a' : status === 'DETAINED' ? '#9a9670' : '#ffd27a'
  return (
    <svg viewBox="-1 -1 9 11" width={size} height={size * (11 / 9)} shapeRendering="crispEdges" aria-hidden="true" className="inset shrink-0 bg-[#0b0703]">
      <rect x="-1" y="-1" width="9" height="11" fill={erased ? '#000' : '#14110a'} />
      {!erased && cells.map(([x, y]) => <rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" fill={ink} opacity={0.9} />)}
      {/* Height chart lines, like an intake photo. */}
      {!erased && [0, 2, 4, 6].map((y) => <rect key={y} x="-1" y={y + 0.95} width="9" height="0.06" fill="#ffd27a" opacity={0.18} />)}
      <rect x="-1" y="7.4" width="9" height="2.6" fill={erased ? '#000' : '#26251b'} />
      <text x="3.5" y="9.3" textAnchor="middle" fontSize="1.6" fontFamily="Silkscreen, monospace" fill={erased ? '#3a3a2a' : '#e9cf66'}>
        {erased ? '------' : personId}
      </text>
    </svg>
  )
}

export function StatusLamp({ status, withLabel = true }: { status: PersonStatus; withLabel?: boolean }) {
  const m = PERSON_STATUS_META[status]
  return (
    <Tip text={m.hint}>
      <span className="inline-flex items-center gap-2" tabIndex={0}>
        <span data-on={m.lamp} className={`lamp size-3.5 ${status === 'WANTED' ? 'animate-blink' : ''}`} aria-hidden="true" />
        {withLabel && <span className="label">{m.label}</span>}
      </span>
    </Tip>
  )
}

/** Segmented threat level, 0–100. The tick marks where a warrant goes out by itself. */
export function HeatMeter({ heat, segments = 20 }: { heat: number; segments?: number }) {
  const lit = Math.round((heat / 100) * segments)
  const mark = Math.round((WANTED_HEAT / 100) * segments)
  return (
    <Tip text={`Threat level ${heat}/100: how hard the agency is hunting them. At ${WANTED_HEAT} a warrant goes out automatically. Pinning attacks on someone raises it.`}>
      <span className="flex w-full items-center gap-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={heat} aria-label="Threat level" tabIndex={0}>
        <span className="inset flex flex-1 gap-[2px] bg-[#0b0703] p-1" aria-hidden="true">
          {Array.from({ length: segments }, (_, i) => {
            const on = i < lit
            const color = i >= mark ? '#ff5a3a' : '#ffb22e'
            return (
              <span
                key={i}
                className={`h-3 flex-1 ${i === mark ? 'outline outline-1 outline-[#e9cf66]/40' : ''}`}
                style={{ background: on ? color : '#1c1a12', boxShadow: on ? `0 0 5px ${color}` : undefined }}
              />
            )
          })}
        </span>
        <span className="readout w-14 px-1.5 text-center text-xl leading-tight tabular-nums">{String(heat).padStart(3, '0')}</span>
      </span>
    </Tip>
  )
}

/** Redaction bar for text the viewer isn't cleared to read. */
export function Redacted({ length, label = 'Classified' }: { length: number; label?: string }) {
  const n = Math.max(4, Math.min(48, Math.round(length * 0.6)))
  return (
    <Tip text="Classified. Commanders only.">
      <span tabIndex={0} aria-label={label} className="cursor-help bg-[#0b0703] text-[#0b0703] select-none [overflow-wrap:anywhere]">
        {'█'.repeat(n)}
      </span>
    </Tip>
  )
}
