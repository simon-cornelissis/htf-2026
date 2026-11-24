import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { InfoTip } from '#/components/ui/Tooltip.tsx'
import { startersFor } from '#/chat/starters.ts'
import { CHAT_LIMITS, type ChatEntry, type ChatStatus, type ChatView } from '#/chat/types.ts'
import { ROLE_LABEL, type GuardianRole } from '#/lib/glitch.ts'
import { decideChatAction, getChatStatus, getChatThread, resetChat, sendChatMessage } from '#/lib/chat.functions.ts'

const THREAD_KEY = 'custodian.thread'

function readThreadId(): string | undefined {
  try {
    return sessionStorage.getItem(THREAD_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function writeThreadId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(THREAD_KEY, id)
    else sessionStorage.removeItem(THREAD_KEY)
  } catch {
    // storage blocked: the thread just won't survive a reload
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'The uplink failed. Try again.')

/** The CUSTODIAN side panel: chat with the agency's terminal intelligence. */
export function ChatDock({ open, onClose, role }: { open: boolean; onClose: () => void; role: GuardianRole }) {
  const router = useRouter()
  const [status, setStatus] = useState<ChatStatus | null>(null)
  const [view, setView] = useState<ChatView | null>(null)
  const [localNotes, setLocalNotes] = useState<ChatEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)

  // On first open: is CUSTODIAN online, and is there a thread to resume?
  useEffect(() => {
    if (!open || loaded.current) return
    loaded.current = true
    void (async () => {
      try {
        const s = await getChatStatus()
        setStatus(s)
        if (s.online) {
          const id = readThreadId()
          if (id) {
            const v = await getChatThread({ data: { threadId: id } })
            if (v) setView(v)
            else writeThreadId(null)
          }
        }
      } catch (err) {
        setStatus({ online: false, reason: errorText(err) })
      }
    })()
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0)
  }, [open])

  const entries = [...(view?.entries ?? []), ...localNotes]

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight })
  }, [entries.length, busy, view])

  function adopt(v: ChatView) {
    setView(v)
    setLocalNotes([])
    writeThreadId(v.threadId)
  }

  function note(text: string) {
    setLocalNotes((n) => [...n, { id: `local-${Date.now()}`, kind: 'notice', tone: 'error', text }])
  }

  async function send(message: string) {
    const clean = message.trim()
    if (!clean || busy) return
    setBusy(true)
    setText('')
    // Show the operator's line straight away; the server's view replaces it.
    setLocalNotes((n) => [...n, { id: `local-u-${Date.now()}`, kind: 'user', text: clean }])
    try {
      adopt(await sendChatMessage({ data: { threadId: view?.threadId, text: clean } }))
    } catch (err) {
      setLocalNotes((n) => n.filter((e) => e.kind !== 'user'))
      setText(clean)
      note(errorText(err))
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  async function decide(actionId: string, approve: boolean) {
    if (!view || busy) return
    setBusy(true)
    try {
      const v = await decideChatAction({ data: { threadId: view.threadId, actionId, approve } })
      adopt(v)
      if (v.executed) await router.invalidate()
    } catch (err) {
      note(errorText(err))
      // Re-sync: the action may have been decided already.
      const fresh = await getChatThread({ data: { threadId: view.threadId } }).catch(() => null)
      if (fresh) setView(fresh)
    } finally {
      setBusy(false)
    }
  }

  async function newThread() {
    if (busy) return
    const id = view?.threadId
    setView(null)
    setLocalNotes([])
    writeThreadId(null)
    if (id) await resetChat({ data: { threadId: id } }).catch(() => {})
    input.current?.focus()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(text)
  }

  function onInputKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(text)
    }
  }

  const online = status?.online === true
  const pending = view?.pendingActionId ?? null

  return (
    <aside
      aria-label="CUSTODIAN terminal intelligence"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className={`metal fixed inset-y-0 right-0 z-[150] flex w-full flex-col gap-3 p-3 transition-transform duration-200 sm:w-[30rem] sm:p-4 ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      <header className="flex items-center gap-3">
        <span aria-hidden="true" data-on={!status ? undefined : online ? 'green' : 'red'} className="lamp size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="stamp text-lg leading-none">CUSTODIAN</div>
          <div className="mt-1 text-lg leading-none text-ink-dim">TERMINAL INTELLIGENCE · {ROLE_LABEL[role].toUpperCase()} CLEARANCE</div>
        </div>
        <InfoTip
          label="How CUSTODIAN works"
          text="CUSTODIAN reads the terminal for you on its own. Anything that changes the world (reports, wire cuts, status changes, operations) waits for your Approve. Operations need a press-and-hold."
        />
        <button type="button" onClick={newThread} disabled={busy || !view} className="btn px-2.5 py-1.5 text-xs">
          New
        </button>
        <button type="button" onClick={onClose} aria-label="Close CUSTODIAN" title="Close (Esc)" className="btn flex size-9 items-center justify-center">
          <X className="size-4" />
        </button>
      </header>

      <div ref={screen} className="crt min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {!status && <p className="text-xl text-phos-dim">Establishing uplink…</p>}

        {status && !status.online && (
          <div className="space-y-2 text-xl">
            <p className="text-[#ff6a4e]">{status.reason}</p>
            <p className="text-phos-dim">The rest of the terminal keeps working.</p>
          </div>
        )}

        {online && entries.length === 0 && (
          <div className="space-y-3">
            <p className="text-xl text-phos">CUSTODIAN ONLINE. State your request, operator.</p>
            <div className="flex flex-wrap gap-2">
              {startersFor(role).map((s) => (
                <button key={s.label} type="button" className="btn px-3 py-1.5 text-xs" onClick={() => void send(s.prompt)} disabled={busy}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id}>
              <Entry entry={e} pending={pending} busy={busy} onDecide={decide} />
            </li>
          ))}
        </ol>

        {busy && (
          <p className="mt-3 text-xl text-phos-dim">
            CUSTODIAN is processing<span className="animate-blink">_</span>
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="custodian-input">
          Message to CUSTODIAN
        </label>
        <textarea
          id="custodian-input"
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onInputKey}
          rows={2}
          maxLength={CHAT_LIMITS.maxMessageChars}
          disabled={!online}
          placeholder={online ? (pending ? 'Decide on the card above, or type to reject it…' : 'Ask CUSTODIAN…') : 'CUSTODIAN offline'}
          className="inset min-w-0 flex-1 resize-none bg-[#0b0703] px-3 py-2 text-xl leading-tight text-phos placeholder:text-phos-dim/70 focus:outline-2 focus:outline-amber"
        />
        <button type="submit" className="btn btn-primary px-4 py-3 text-sm" disabled={!online || busy || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}

function Entry({
  entry,
  pending,
  busy,
  onDecide,
}: {
  entry: ChatEntry
  pending: string | null
  busy: boolean
  onDecide: (actionId: string, approve: boolean) => void
}) {
  switch (entry.kind) {
    case 'user':
      return (
        <p className="text-xl whitespace-pre-wrap text-amber">
          <span aria-hidden="true">&gt; </span>
          {entry.text}
        </p>
      )
    case 'assistant':
      return <PlainText text={entry.text} />
    case 'consulted':
      return <p className="text-lg text-phos-dim">· consulted: {entry.tools.join(', ')}</p>
    case 'notice':
      return <p className={`text-xl ${entry.tone === 'error' ? 'text-[#ff6a4e]' : 'text-phos-dim'}`}>! {entry.text}</p>
    case 'action':
      return <ActionCard entry={entry} isPending={pending === entry.actionId} busy={busy} onDecide={onDecide} />
  }
}

/** Plain text with paragraphs and "- " bullets. Text nodes only: never HTML. */
function PlainText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      const items = bullets
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="space-y-0.5">
          {items.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true">▪</span>
              <span className="min-w-0">{b}</span>
            </li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '$1').trimEnd()
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      bullets.push(bullet[1])
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{line.replace(/^#+\s*/, '')}</p>)
  }
  flush()
  return <div className="space-y-1.5 text-xl leading-snug text-phos">{blocks}</div>
}

const STATUS_TEXT: Record<Extract<ChatEntry, { kind: 'action' }>['status'], string> = {
  queued: 'Queued',
  pending: 'Awaiting your decision',
  done: 'Executed',
  failed: 'Failed',
  rejected: 'Rejected',
}

function ActionCard({
  entry,
  isPending,
  busy,
  onDecide,
}: {
  entry: Extract<ChatEntry, { kind: 'action' }>
  isPending: boolean
  busy: boolean
  onDecide: (actionId: string, approve: boolean) => void
}) {
  const attack = entry.effect === 'attack'
  const params = entry.params
  return (
    <section
      aria-label={`${entry.title}: ${STATUS_TEXT[entry.status]}`}
      className={`border-2 bg-black/40 p-3 ${attack ? 'border-[#ff5a3a]' : 'border-amber'} ${entry.status === 'pending' ? '' : 'opacity-85'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`label ${attack ? 'text-[#ff6a4e]' : ''}`}>{attack ? 'Attack' : 'Action'}</span>
        <span className="text-xl text-ink">{entry.title}</span>
        <span className="ml-auto text-lg text-phos-dim">{STATUS_TEXT[entry.status]}</span>
      </div>
      <p className="mt-1.5 text-xl leading-snug text-ink">{entry.summary}</p>
      {params.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-lg leading-tight">
          {params.map((p) => (
            <div key={p.name} className="contents">
              <dt className="text-phos-dim">{p.name}</dt>
              <dd className="min-w-0 break-words text-phos">{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.result && <p className={`mt-2 text-lg ${entry.status === 'done' ? 'text-phos' : 'text-[#ff6a4e]'}`}>→ {entry.result}</p>}
      {isPending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {attack ? (
            <HoldButton
              onConfirm={() => onDecide(entry.actionId, true)}
              label={`Hold to authorise: ${entry.title}`}
              holdMs={1200}
              className="btn btn-primary px-3 py-2 text-sm"
            >
              Hold to authorise
            </HoldButton>
          ) : (
            <button type="button" className="btn btn-primary px-3 py-2 text-sm" disabled={busy} onClick={() => onDecide(entry.actionId, true)}>
              Approve
            </button>
          )}
          <button type="button" className="btn px-3 py-2 text-sm" disabled={busy} onClick={() => onDecide(entry.actionId, false)}>
            Reject
          </button>
        </div>
      )}
    </section>
  )
}
