import { STATUS_META, type GlitchStatus } from '#/lib/glitch.ts'

/** Lamp colour + text colour per status. Lamp, colour and label: never colour alone. */
const STYLE: Record<GlitchStatus, { lamp?: 'red' | 'amber' | 'green'; text: string; blink?: boolean }> = {
  LEAKED: { lamp: 'red', text: 'text-[#ff7a5c]', blink: true },
  ASSESSING: { lamp: 'amber', text: 'text-amber' },
  CONTAINING: { lamp: 'green', text: 'text-phos' },
  FIXED: { text: 'text-phos-dim' },
}

/** Status as an indicator lamp with a label, e.g. ● LEAKED. VT323, so it stays readable in dense lists. */
export function StatusStamp({
  status,
  size = 'sm',
}: {
  status: GlitchStatus
  size?: 'sm' | 'lg'
}) {
  const s = STYLE[status]
  return (
    <span className={`inline-flex items-center gap-2 font-mono leading-none whitespace-nowrap uppercase ${s.text} ${size === 'lg' ? 'text-3xl' : 'text-xl'}`} title={STATUS_META[status].hint}>
      <span
        aria-hidden="true"
        data-on={s.lamp}
        className={`lamp ${size === 'lg' ? 'size-4' : 'size-2.5'} ${s.blink ? 'animate-blink' : ''}`}
      />
      {STATUS_META[status].label}
    </span>
  )
}
