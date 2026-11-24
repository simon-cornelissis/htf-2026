import type { CSSProperties, ReactNode } from 'react'
import type { FxPhase } from '#/lib/incidents.ts'
import type { FxKind } from '#/lib/operations.ts'

/**
 * Map effect for one incident, drawn at (x, y) in the parent SVG.
 * Pixel art from squares; animation lives in styles.css (fx-* classes) so
 * prefers-reduced-motion leaves a still frame: residue, smoke, radius.
 *
 * Phases follow the incident's age: fresh (big one-off motion), hot (flames,
 * fog, crowds), smoky (smoke and stains), then only a fading residue mark.
 */
export function IncidentFx({
  fx,
  x,
  y,
  r,
  u,
  phase,
  seed,
  replay = false,
  showRadius = false,
  highlight = false,
  title,
  layer = 'all',
}: {
  /** Ground (residue, radius) goes under landmarks, air (smoke, flames) over them. */
  layer?: 'ground' | 'air' | 'all'
  fx: FxKind
  x: number
  y: number
  /** Affected radius, in the parent SVG's units. */
  r: number
  /** Size of one art pixel, in the parent SVG's units. */
  u: number
  phase: FxPhase
  seed: number
  /** Play the one-off motion again, as if it just happened. */
  replay?: boolean
  showRadius?: boolean
  highlight?: boolean
  title?: string
}) {
  if (!phase.visible && !replay && !highlight) return null
  const fresh = phase.fresh || replay
  const hot = phase.hot || replay
  const smoky = phase.smoky || replay
  // Even old residue stays faintly visible until it's gone.
  const fade = replay ? 1 : 0.35 + 0.65 * phase.intensity
  const c = COLORS[fx]
  const reach = Math.max(r, u * 6)
  const ground = layer !== 'air'
  const air = layer !== 'ground'

  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden="true" className="fx-in">
      {title && air && <title>{title}</title>}
      {ground && (
        <g opacity={fade} shapeRendering="crispEdges">
          <Residue fx={fx} u={u} reach={reach} rand={rng(seed)} />
        </g>
      )}

      {/* Radius only for the last day (or when pointed at), so old circles don't pile up. */}
      {ground && showRadius && r > 0 && (smoky || highlight) && (
        <circle
          className="fx fx-zone"
          r={r}
          fill={c.zone}
          fillOpacity={0.08 + 0.1 * phase.intensity}
          stroke={c.main}
          strokeWidth={u * 0.75}
          strokeDasharray={`${u * 3} ${u * 2}`}
          opacity={0.45 + 0.45 * phase.intensity}
          shapeRendering="crispEdges"
        />
      )}

      {air && (
        <g opacity={replay ? 1 : Math.max(0.3, phase.intensity)}>
          <Live fx={fx} u={u} reach={reach} rand={rng(seed + 7)} fresh={fresh} hot={hot} smoky={smoky} age={phase.age} />
        </g>
      )}

      {air && fresh && <OneOff fx={fx} u={u} reach={reach} infinite={phase.fresh && !replay} />}

      {air && highlight && (
        <g shapeRendering="crispEdges" fill="none" stroke="#ffb22e" strokeWidth={u} className="fx fx-lock animate-blink">
          <Brackets s={Math.max(reach * 0.6, u * 10)} u={u} />
        </g>
      )}
    </g>
  )
}

type Rand = () => number

const COLORS: Record<FxKind, { main: string; zone: string }> = {
  explosion: { main: '#ff5a1a', zone: '#ff3a22' },
  fire: { main: '#ffb22e', zone: '#ff5a1a' },
  gas: { main: '#a6e05a', zone: '#7ec850' },
  poison: { main: '#b48ad8', zone: '#8fd06a' },
  collapse: { main: '#c9c4a0', zone: '#8c8676' },
  crowd: { main: '#ff8a6a', zone: '#ff5a4a' },
  flicker: { main: '#ffe36a', zone: '#000000' },
  surge: { main: '#6fd0ff', zone: '#6fd0ff' },
  siren: { main: '#ff3a22', zone: '#ff3a22' },
  echo: { main: '#b9a0ff', zone: '#b9a0ff' },
  vanish: { main: '#e9f5c8', zone: '#3a3a5a' },
  calm: { main: '#6dff55', zone: '#6dff55' },
}

function rng(seed: number): Rand {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Snap to the art grid so everything stays on whole pixels. */
const snap = (v: number, u: number) => Math.round(v / u) * u

/** A blob of square pixels scattered around the centre, denser in the middle. */
function scatter(rand: Rand, count: number, spread: number, u: number) {
  return Array.from({ length: count }, () => {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * spread
    return { x: snap(Math.cos(a) * d, u), y: snap(Math.sin(a) * d, u), s: (1 + Math.floor(rand() * 2)) * u, k: rand() }
  })
}

function Px({ x, y, s, fill, className, style, opacity }: { x: number; y: number; s: number; fill: string; className?: string; style?: CSSProperties; opacity?: number }) {
  return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={fill} className={className} style={style} opacity={opacity} />
}

function Brackets({ s, u }: { s: number; u: number }) {
  const l = u * 3
  return (
    <path
      d={`M${-s} ${-s + l}V${-s}H${-s + l} M${s - l} ${-s}H${s}V${-s + l} M${s} ${s - l}V${s}H${s - l} M${-s + l} ${s}H${-s}V${s - l}`}
    />
  )
}

/** What's left on the ground: scorch, stains, rubble. */
function Residue({ fx, u, reach, rand }: { fx: FxKind; u: number; reach: number; rand: Rand }) {
  const ground = (count: number, spread: number, colors: string[]) =>
    scatter(rand, count, spread, u).map((p, i) => <Px key={i} x={p.x} y={p.y} s={p.s * 1.5} fill={colors[Math.floor(p.k * colors.length)]} />)
  switch (fx) {
    case 'explosion':
      return <>{ground(34, reach * 0.55, ['#140c06', '#24170c', '#3a2414'])}</>
    case 'fire':
      return <>{ground(26, reach * 0.5, ['#140c06', '#2a1a0e', '#4a2a14'])}</>
    case 'collapse':
      return <>{ground(30, reach * 0.5, ['#5a5446', '#8c8676', '#3a352a', '#c9c4a0'])}</>
    case 'gas':
      return <>{ground(16, reach * 0.45, ['#4e6a2c', '#5a7a30'])}</>
    case 'poison':
      return <>{ground(18, reach * 0.45, ['#3a5a3a', '#5a3a6a', '#2a4a3a'])}</>
    case 'crowd':
      return <>{ground(14, reach * 0.5, ['#3a2a1a', '#5a4a2c', '#2a1a0e'])}</>
    case 'vanish':
      // Shadows left on the walls.
      return (
        <>
          {scatter(rand, 5, reach * 0.4, u).map((p, i) => (
            <rect key={i} x={p.x - u} y={p.y - u * 2} width={u * 2} height={u * 4} fill="#000" opacity="0.55" />
          ))}
        </>
      )
    case 'flicker':
    case 'surge':
      return <>{ground(8, reach * 0.35, ['#1a140a', '#2a2a2a'])}</>
    default:
      return null
  }
}

/** Ongoing motion: smoke, flames, fog, crowds. */
function Live({
  fx,
  u,
  reach,
  rand,
  fresh,
  hot,
  smoky,
  age,
}: {
  fx: FxKind
  u: number
  reach: number
  rand: Rand
  fresh: boolean
  hot: boolean
  smoky: boolean
  age: number
}) {
  const parts: ReactNode[] = []
  const smoke = (count: number, colors: string[], size: number) => {
    for (let i = 0; i < count; i++) {
      const dx = snap((rand() - 0.5) * reach * 0.5, u)
      parts.push(
        <g key={`s${i}`} transform={`translate(${dx} ${-u * 2})`}>
          <rect
            className="fx fx-rise"
            x={-size / 2}
            y={-size / 2}
            width={size}
            height={size}
            fill={colors[i % colors.length]}
            style={
              {
                '--rise': `${-reach * 0.9 - u * 10}px`,
                '--dx': `${u * (4 + rand() * 6)}px`,
                animationDuration: `${7 + rand() * 6}s`,
                animationDelay: `${-rand() * 12}s`,
              } as CSSProperties
            }
            opacity={0.75}
          />
        </g>,
      )
    }
  }

  switch (fx) {
    case 'explosion':
      if (hot) {
        scatter(rand, 6, reach * 0.35, u).forEach((p, i) =>
          parts.push(<Px key={`e${i}`} x={p.x} y={p.y} s={u} fill={i % 2 ? '#ffb22e' : '#ff5a1a'} className="fx fx-ember" style={{ animationDelay: `${-p.k * 2}s` }} />),
        )
      }
      if (smoky) smoke(fresh ? 9 : 5, ['#6a6458', '#8c8676', '#4a453c'], u * 5)
      break
    case 'fire':
      if (hot) {
        scatter(rand, fresh ? 9 : 6, reach * 0.35, u).forEach((p, i) =>
          parts.push(
            <g key={`f${i}`} transform={`translate(${p.x} ${p.y})`}>
              <rect className="fx fx-flame" x={-u * 1.5} y={-u * 4} width={u * 3} height={u * 4} fill="#ff5a1a" style={{ animationDelay: `${-p.k}s` }} />
              <rect className="fx fx-flame" x={-u * 0.5} y={-u * 3} width={u} height={u * 3} fill="#ffe36a" style={{ animationDelay: `${-p.k * 0.7}s` }} />
            </g>,
          ),
        )
      }
      if (smoky) smoke(hot ? 7 : 4, ['#3a352a', '#4a453c', '#5a5446'], u * 5)
      break
    case 'gas': {
      if (!smoky) break
      // The fog drifts downwind (east, a little north) as the hours pass.
      const drift = Math.min(1, age / (6 * 3_600_000)) * reach * 0.8
      const blobs = scatter(rand, hot ? 14 : 7, reach * 0.55, u)
      parts.push(
        <g key="gas" transform={`translate(${snap(drift, u)} ${snap(-drift * 0.3, u)})`}>
          <g className="fx fx-drift" style={{ '--drift': `${reach * 0.25}px` } as CSSProperties}>
            {blobs.map((p, i) => (
              <rect
                key={i}
                className="fx fx-puff"
                x={p.x - p.s * 2}
                y={p.y - p.s * 1.5}
                width={p.s * 4}
                height={p.s * 3}
                fill={['#7ec850', '#a6e05a', '#4e8a2c'][i % 3]}
                opacity={0.45}
                style={{ animationDelay: `${-p.k * 4}s` }}
              />
            ))}
          </g>
        </g>,
      )
      break
    }
    case 'poison':
      if (!smoky) break
      for (let i = 0; i < (hot ? 3 : 2); i++) {
        parts.push(
          <circle
            key={`p${i}`}
            className="fx fx-ripple"
            r={reach * 0.6}
            fill="none"
            stroke={i % 2 ? '#8fd06a' : '#b48ad8'}
            strokeWidth={u}
            shapeRendering="crispEdges"
            style={{ animationDelay: `${-i * 1.3}s` }}
          />,
        )
      }
      parts.push(<Px key="drop" x={0} y={0} s={u * 3} fill="#b48ad8" />)
      break
    case 'collapse':
      if (fresh) smoke(8, ['#b8a888', '#c9c4a0', '#8c8676'], u * 5)
      else if (hot) smoke(3, ['#b8a888', '#8c8676'], u * 4)
      break
    case 'crowd': {
      if (!hot) break
      const people = scatter(rand, fresh ? 22 : 12, reach * 0.5, u)
      people.forEach((p, i) =>
        parts.push(
          <Px key={`c${i}`} x={p.x} y={p.y} s={u * 1.5} fill={i % 3 ? '#ff8a6a' : '#ffd27a'} className="fx fx-jitter" style={{ animationDelay: `${-p.k}s` }} />,
        ),
      )
      // A few torches.
      people.slice(0, 3).forEach((p, i) =>
        parts.push(<Px key={`t${i}`} x={p.x} y={p.y - u * 2} s={u} fill="#ffe36a" className="fx fx-ember" style={{ animationDelay: `${-p.k * 2}s` }} />),
      )
      if (fresh) smoke(3, ['#4a453c', '#5a5446'], u * 4)
      break
    }
    case 'flicker':
      if (!smoky) break
      parts.push(<circle key="dark" r={reach * 0.7} fill="#000" opacity={0.35} className="fx fx-dark" />)
      scatter(rand, 6, reach * 0.5, u).forEach((p, i) =>
        parts.push(<Px key={`l${i}`} x={p.x} y={p.y} s={u} fill="#ffe36a" className="animate-flicker" style={{ animationDelay: `${-p.k * 6}s` }} />),
      )
      break
    case 'surge':
      if (!hot) break
      for (let i = 0; i < (fresh ? 4 : 2); i++) {
        const a = rand() * Math.PI * 2
        const pts = Array.from({ length: 5 }, (_, k) => {
          const d = (k / 4) * reach * 0.6
          const j = (k % 2 ? 1 : -1) * u * 2
          return `${snap(Math.cos(a) * d - Math.sin(a) * j, u)},${snap(Math.sin(a) * d + Math.cos(a) * j, u)}`
        }).join(' ')
        parts.push(
          <polyline key={`a${i}`} points={pts} fill="none" stroke={i % 2 ? '#e6f8ff' : '#6fd0ff'} strokeWidth={u} className="fx fx-arc" style={{ animationDelay: `${-rand()}s` }} />,
        )
      }
      break
    case 'siren':
      if (!hot) break
      parts.push(<circle key="s1" className="fx fx-ripple" r={reach * 0.6} fill="none" stroke="#ff3a22" strokeWidth={u} />)
      parts.push(<circle key="s2" className="fx fx-ripple" r={reach * 0.6} fill="none" stroke="#ffb22e" strokeWidth={u} style={{ animationDelay: '-1s' }} />)
      parts.push(<Px key="lamp" x={0} y={0} s={u * 3} fill="#ff3a22" className="animate-blink" />)
      break
    case 'echo':
      if (!smoky) break
      parts.push(<circle key="g1" className="fx fx-ripple fx-slow" r={reach * 0.5} fill="none" stroke="#b9a0ff" strokeWidth={u * 0.75} />)
      parts.push(
        <g key="ghost" className="fx fx-ghost">
          <rect x={-u} y={-u * 4} width={u * 2} height={u * 2} fill="#d8ccff" />
          <rect x={-u * 1.5} y={-u * 2} width={u * 3} height={u * 4} fill="#b9a0ff" />
        </g>,
      )
      break
    case 'vanish':
      if (!smoky) break
      scatter(rand, 6, reach * 0.4, u).forEach((p, i) =>
        parts.push(
          <rect
            key={`v${i}`}
            x={p.x - u}
            y={p.y - u * 2}
            width={u * 2}
            height={u * 4}
            fill="none"
            stroke="#e9f5c8"
            strokeWidth={u * 0.5}
            className="fx fx-vanish"
            style={{ animationDelay: `${-p.k * 5}s` }}
          />,
        ),
      )
      break
    case 'calm':
      if (smoky) parts.push(<circle key="ok" r={u * 5} fill="none" stroke="#6dff55" strokeWidth={u * 0.75} opacity={0.7} shapeRendering="crispEdges" />)
      break
  }
  return <g shapeRendering="crispEdges">{parts}</g>
}

/** The big moment: blast ring and flash, collapse dust, a burst of sparks. Plays while fresh, or on replay. */
function OneOff({ fx, u, reach, infinite }: { fx: FxKind; u: number; reach: number; infinite: boolean }) {
  const count = infinite ? 'infinite' : 3
  const ring = (color: string, delay = 0) => (
    <circle
      className="fx fx-ring"
      r={reach}
      fill="none"
      stroke={color}
      strokeWidth={u * 1.5}
      shapeRendering="crispEdges"
      style={{ animationIterationCount: count, animationDelay: `${delay}s` }}
    />
  )
  switch (fx) {
    case 'explosion':
      return (
        <g>
          <circle className="fx fx-flash" r={reach * 0.7} fill="#fff6d0" style={{ animationIterationCount: count }} />
          {ring('#ffe36a')}
          {ring('#ff5a1a', 0.25)}
        </g>
      )
    case 'collapse':
      return <g>{ring('#c9c4a0')}</g>
    case 'surge':
      return (
        <g>
          <circle className="fx fx-flash" r={reach * 0.5} fill="#e6f8ff" style={{ animationIterationCount: count }} />
          {ring('#6fd0ff')}
        </g>
      )
    case 'fire':
      return <g>{ring('#ffb22e')}</g>
    case 'gas':
    case 'poison':
      return <g>{ring(COLORS[fx].main)}</g>
    default:
      return null
  }
}
