import { AnimatedNumber } from '#/components/ui/AnimatedNumber.tsx'
import { InfoTip } from '#/components/ui/Tooltip.tsx'
import type { Mood } from '#/lib/districts.ts'

const METERS: {
  key: keyof Mood
  label: string
  info: string
  /** Higher is worse for fear and anxiety, better for happiness. */
  goodHigh: boolean
}[] = [
  {
    key: 'happiness',
    label: 'Happiness',
    info: 'How content residents are. Drops with every open glitch and every incident at a landmark.',
    goodHigh: true,
  },
  {
    key: 'fear',
    label: 'Fear',
    info: 'How scared residents are of the Desync. Sightings and evacuations push it up hardest.',
    goodHigh: false,
  },
  {
    key: 'anxiety',
    label: 'Anxiety',
    info: 'Background worry: shortages, blackouts, not knowing what comes next. Fades slowly over two days.',
    goodHigh: false,
  },
]

function colorFor(value: number, goodHigh: boolean) {
  const bad = goodHigh ? 100 - value : value
  if (bad >= 60) return '#ff3a22'
  if (bad >= 40) return '#ffb22e'
  return '#6dff55'
}

/** Segmented bars for happiness, fear and anxiety, with change vs. the district's normal. */
export function MoodMeters({ mood, baseline, size = 'md' }: { mood: Mood; baseline?: Mood; size?: 'sm' | 'md' }) {
  const segments = size === 'sm' ? 12 : 20
  return (
    <dl className="flex flex-col gap-2.5">
      {METERS.map(({ key, label, info, goodHigh }) => {
        const value = mood[key]
        const lit = Math.round((value / 100) * segments)
        const color = colorFor(value, goodHigh)
        const delta = baseline ? value - baseline[key] : 0
        const worse = goodHigh ? delta < 0 : delta > 0
        return (
          <div key={key} className={`grid items-center gap-3 ${size === 'sm' ? 'grid-cols-[6.5rem_1fr_auto]' : 'grid-cols-[7.5rem_1fr_auto]'}`}>
            <dt className="flex items-center gap-2">
              <span className="text-xl leading-none text-ink uppercase">{label}</span>
              <InfoTip label={`What is ${label.toLowerCase()}?`} text={info} />
            </dt>
            <dd className="inset flex gap-[2px] bg-[#0b0703] p-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
              {Array.from({ length: segments }, (_, i) => (
                <span
                  key={i}
                  className="meter-seg h-3 flex-1"
                  // Segments light up / go dark one after another, like a VU meter.
                  style={{ background: i < lit ? color : '#1c1a12', boxShadow: i < lit ? `0 0 5px ${color}` : '0 0 0 transparent', transitionDelay: `${i * 14}ms` }}
                />
              ))}
            </dd>
            <dd className="readout flex min-w-[4.5rem] items-baseline justify-end gap-1.5 px-2 text-2xl leading-none">
              <AnimatedNumber value={value} />
              {baseline && delta !== 0 && (
                <span className={`text-base ${worse ? 'text-[#ff6a4e]' : 'text-[#9dff86]'}`} title="Change from this district's normal">
                  {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                </span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
