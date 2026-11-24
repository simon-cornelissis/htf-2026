import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { siteName } from '#/lib/districts.ts'
import { OPERATION_META } from '#/lib/operations.ts'
import { cancelOperation, type Operation } from '#/lib/operations.functions.ts'
import { countdown, useNow } from '#/lib/useNow.ts'

/** Compact list of a district's operations: lamp, id, type, site, then countdown + Cancel or a link to the staged glitch. */
export function OperationsLog({ operations }: { operations: Operation[] }) {
  const router = useRouter()
  const now = useNow(1000)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Once a planned operation's time passes, reload so it fires and shows up.
  const fired = useRef(new Set<string>())
  useEffect(() => {
    for (const op of operations) {
      if (op.status === 'PLANNED' && new Date(op.scheduledFor).getTime() <= now && !fired.current.has(op.operationId)) {
        fired.current.add(op.operationId)
        router.invalidate()
      }
    }
  }, [now, operations, router])

  async function cancel(operationId: string) {
    setMessage(null)
    try {
      await cancelOperation({ data: operationId })
      await router.invalidate()
      setMessage({ tone: 'ok', text: `${operationId} cancelled.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t cancel. Try again.' })
    }
  }

  if (operations.length === 0) {
    return <p className="text-xl leading-tight text-ink-dim">No operations here yet.</p>
  }

  return (
    <div>
      <ol className="flex flex-col divide-y-2 divide-metal-lo">
        {operations.map((op) => (
          <li key={op.operationId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span
              aria-hidden="true"
              data-on={op.status === 'PLANNED' ? 'amber' : op.status === 'EXECUTED' ? 'red' : undefined}
              className="lamp size-3"
            />
            <span className="font-mono text-xl text-stamp">{op.operationId}</span>
            <span className="min-w-0 text-xl leading-tight text-ink">
              {OPERATION_META[op.type].name} <span className="text-ink-dim">@ {siteName(op.siteId)}</span>
            </span>
            <span className="ml-auto flex items-center gap-2">
              {op.status === 'PLANNED' && (
                <>
                  <span className="readout px-2 text-xl leading-tight" suppressHydrationWarning>T-{countdown(op.scheduledFor, now)}</span>
                  <button type="button" onClick={() => cancel(op.operationId)} className="btn px-3 py-1.5 text-sm">Cancel</button>
                </>
              )}
              {op.status === 'EXECUTED' && op.glitchId && (
                <Link to="/glitches/$glitchId" params={{ glitchId: op.glitchId }} className="btn px-3 py-1.5 text-sm">
                  {op.glitchId} ▸
                </Link>
              )}
              {op.status === 'EXECUTED' && !op.glitchId && <span className="text-lg text-ink-dim uppercase">Executed · file purged</span>}
              {op.status === 'CANCELLED' && <span className="text-lg text-ink-dim/80 uppercase">Cancelled</span>}
            </span>
          </li>
        ))}
      </ol>
      <div aria-live="polite" className={`min-h-6 text-lg ${message?.tone === 'error' ? 'text-[#ff8a6a]' : 'text-[#9dff86]'}`}>
        {message?.text}
      </div>
    </div>
  )
}
