const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'minute') {
      return rtf.format(Math.round(diff / ms), unit)
    }
  }
  return ''
}

/** "3 hours ago", with the exact time on hover. */
export function RelativeTime({ iso, className = '' }: { iso: string; className?: string }) {
  return (
    // Server and browser clocks/time zones differ; the browser's wins.
    <time dateTime={iso} title={full.format(new Date(iso))} className={className} suppressHydrationWarning>
      {relativeTime(iso)}
    </time>
  )
}

export function formatFull(iso: string) {
  return full.format(new Date(iso))
}
