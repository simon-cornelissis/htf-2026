import { createFileRoute, getRouteApi, useRouter } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { HoldButton } from '#/components/ui/HoldButton.tsx'
import { RelativeTime } from '#/components/ui/RelativeTime.tsx'
import { InfoTip, Tip } from '#/components/ui/Tooltip.tsx'
import { ROLE_LABEL } from '#/lib/glitch.ts'
import { createMcpToken, getMcpAccess, revokeMcpToken, type McpTokenRow } from '#/lib/mcp.functions.ts'
import { toolsFor } from '#/mcp/capabilities.ts'
import { handleMcpPost, mcpMethodNotAllowed } from '#/mcp/http.ts'

/**
 * /mcp is two things at once: in a browser it's the "MCP access" page, and
 * for MCP clients it's the Streamable HTTP endpoint (POST with a bearer token).
 * The `server` handlers are stripped from the client bundle.
 */
export const Route = createFileRoute('/_authed/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpPost(request),
      // A client asking for an event stream gets 405 (stateless server, no
      // server-initiated messages). Browsers fall through to the page.
      GET: ({ request, next }) => {
        const accept = request.headers.get('accept') ?? ''
        if (accept.includes('text/event-stream') && !accept.includes('text/html')) return mcpMethodNotAllowed()
        return next()
      },
      DELETE: () => mcpMethodNotAllowed(),
    },
  },
  loader: () => getMcpAccess(),
  head: () => ({ meta: [{ title: 'MCP access · Guardians of the Grid' }] }),
  component: McpAccessPage,
})

const authed = getRouteApi('/_authed')

const SERVER_NAME = 'achrona'

function McpAccessPage() {
  const { tokens, capabilities } = Route.useLoaderData()
  const { guardian } = authed.useRouteContext()
  const [fresh, setFresh] = useState<{ token: string; label: string } | null>(null)
  // The endpoint URL is wherever this page is served from; the browser knows best.
  const [origin, setOrigin] = useState('http://localhost:3000')
  useEffect(() => setOrigin(window.location.origin), [])
  const endpoint = `${origin}/mcp`

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="stamp text-2xl font-bold">MCP access</h1>
        <p className="text-xl leading-tight text-[#d8d3a6]">
          Connect Claude (Claude Code, Claude Desktop or any MCP client) to this terminal. It acts as you,{' '}
          <span className="text-amber">{guardian.codename}</span>, with exactly your rights: whatever you can’t do here, it can’t either.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <CreateToken onCreated={setFresh} />
          {fresh && <FreshToken token={fresh.token} label={fresh.label} endpoint={endpoint} onDone={() => setFresh(null)} />}
          <TokenList tokens={tokens} />
          <ConnectGuide endpoint={endpoint} token={fresh?.token} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="caps-heading" className="metal rivets p-5">
            <h2 id="caps-heading" className="stamp mb-3 flex items-center gap-2 text-lg font-bold">
              What Claude can do as a {ROLE_LABEL[guardian.role].toLowerCase()}
              <InfoTip text="Tools follow your role. If your role changes, a connected client sees the new set on its next request." />
            </h2>
            <ul className="flex flex-col gap-2">
              {capabilities.map((c) => (
                <li key={c} className="flex items-start gap-3 text-xl leading-tight text-ink">
                  <span data-on="green" className="lamp mt-1.5 size-3 shrink-0" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-lg leading-tight text-ink-dim">
              Deleting glitches or echoes stays with humans: it isn’t available over MCP for any role.
            </p>
            <div className="mt-4">
              <span className="label mb-2 block">Tools</span>
              <div className="flex flex-wrap gap-2">
                {toolsFor(guardian.role).map((t) => (
                  <span key={t} className="readout px-2 text-lg leading-tight">{t}</span>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="try-heading" className="metal rivets p-5">
            <h2 id="try-heading" className="stamp mb-3 text-lg font-bold">Try asking</h2>
            <ul className="flex flex-col gap-2 text-xl leading-tight text-ink">
              <li>“Which district is most afraid, and why?”</li>
              <li>“Give me a situation report.”</li>
              {guardian.role !== 'guardian' && <li>“Defuse the device at Broken Bridge Halt.”</li>}
              {guardian.role !== 'guardian' && <li>“Report lights flickering at Clockworks Central.”</li>}
              {(guardian.role === 'commander' || guardian.role === 'admin') && (
                <li>“Plan a supply scare at the Rustmarket square in 5 minutes.”</li>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function CreateToken({ onCreated }: { onCreated: (t: { token: string; label: string }) => void }) {
  const router = useRouter()
  const [label, setLabel] = useState('Claude Code')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { token } = await createMcpToken({ data: { label } })
      onCreated({ token, label: label.trim() })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create a token. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="create-heading" className="metal rivets p-5">
      <h2 id="create-heading" className="stamp mb-3 flex items-center gap-2 text-lg font-bold">
        New access token
        <InfoTip text="A personal access token lets an MCP client sign in as you. Make one per device or app, so you can revoke them one by one." />
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="label mb-2 block">Name it after where you’ll use it</span>
          <div className="crt rounded-[10px] px-3 py-2">
            <input
              value={label}
              maxLength={60}
              onChange={(e) => { setLabel(e.target.value); setError(null) }}
              placeholder="> CLAUDE CODE ON MY LAPTOP_"
              className="relative z-10 w-full bg-transparent text-[22px] leading-tight text-phos caret-phos placeholder:text-phos-dim focus:outline-none"
            />
          </div>
        </label>
        <button type="submit" disabled={busy || !label.trim()} className="btn btn-primary px-5 py-3 text-sm">
          {busy ? 'Forging…' : 'Create token'}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 min-h-6 text-xl leading-tight text-[#ff8a6a]">{error && `✕ ${error}`}</p>
    </section>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={label} className="btn shrink-0 px-3 py-1.5 text-sm">
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function FreshToken({ token, label, endpoint, onDone }: { token: string; label: string; endpoint: string; onDone: () => void }) {
  return (
    <section aria-labelledby="fresh-heading" className="metal rivets p-5 outline-2 outline-amber">
      <h2 id="fresh-heading" className="stamp mb-2 flex items-center gap-3 text-lg font-bold">
        <span data-on="amber" className="lamp size-3 shrink-0" aria-hidden="true" />
        Token “{label}” created
      </h2>
      <p className="mb-3 text-xl leading-tight text-ink">
        Copy it now. It is shown <span className="text-amber">only once</span>; the terminal keeps just a fingerprint of it.
      </p>
      <div className="flex items-center gap-3">
        <code className="crt min-w-0 flex-1 rounded-[10px] px-3 py-2 font-mono text-xl break-all text-phos">{token}</code>
        <CopyButton text={token} label="Copy access token" />
      </div>
      <p className="mt-3 text-lg leading-tight text-ink-dim">
        The setup commands below now include this token. Endpoint: <span className="text-ink">{endpoint}</span>
      </p>
      <button type="button" onClick={onDone} className="btn mt-3 px-4 py-2 text-sm">I’ve saved it, hide it</button>
    </section>
  )
}

function TokenList({ tokens }: { tokens: McpTokenRow[] }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function revoke(t: McpTokenRow) {
    setMessage(null)
    try {
      await revokeMcpToken({ data: t.id })
      await router.invalidate()
      setMessage({ tone: 'ok', text: `“${t.label}” revoked. Clients using it are cut off.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t revoke. Try again.' })
    }
  }

  return (
    <section aria-labelledby="tokens-heading" className="metal rivets p-5">
      <h2 id="tokens-heading" className="stamp mb-3 text-lg font-bold">Your tokens · {tokens.length}</h2>
      {tokens.length === 0 ? (
        <p className="text-xl leading-tight text-ink-dim">No tokens yet. Create one above to connect a client.</p>
      ) : (
        <ol className="flex flex-col divide-y-2 divide-metal-lo">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <span data-on={t.lastUsedAt ? 'green' : undefined} className="lamp size-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-xl leading-tight text-ink">
                {t.label}
                <Tip text="Fingerprint: the start of the token’s hash. The token itself isn’t stored.">
                  <span className="ml-2 font-mono text-lg text-ink-dim">#{t.id.slice(0, 8)}</span>
                </Tip>
              </span>
              <span className="text-lg leading-tight text-ink-dim">
                Created <RelativeTime iso={t.createdAt} /> · {t.lastUsedAt ? <>last used <RelativeTime iso={t.lastUsedAt} /></> : 'never used'}
              </span>
              <HoldButton onConfirm={() => revoke(t)} label={`Hold to revoke ${t.label}`} className="btn px-3 py-1.5 text-sm">
                Hold to revoke
              </HoldButton>
            </li>
          ))}
        </ol>
      )}
      <div aria-live="polite" className={`min-h-6 text-lg ${message?.tone === 'error' ? 'text-[#ff8a6a]' : 'text-[#9dff86]'}`}>
        {message?.text}
      </div>
    </section>
  )
}

function Snippet({ title, code, hint }: { title: string; code: string; hint?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label flex items-center gap-2">
          {title}
          {hint && <InfoTip text={hint} />}
        </span>
        <CopyButton text={code} label={`Copy ${title}`} />
      </div>
      <pre className="crt overflow-x-auto rounded-[10px] px-3 py-2 font-mono text-lg leading-tight whitespace-pre text-phos">
        <code className="relative z-10">{code}</code>
      </pre>
    </div>
  )
}

function ConnectGuide({ endpoint, token }: { endpoint: string; token?: string }) {
  const t = token ?? '<YOUR_TOKEN>'
  const cli = `claude mcp add --transport http ${SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${t}"`
  const json = JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${t}` } } } }, null, 2)
  return (
    <section aria-labelledby="connect-heading" className="metal rivets p-5">
      <h2 id="connect-heading" className="stamp mb-3 text-lg font-bold">Connect a client</h2>
      <div className="flex flex-col gap-4">
        <Snippet
          title="Claude Code"
          code={cli}
          hint="Run this in a terminal. Then start Claude Code and type /mcp to check it's connected."
        />
        <Snippet
          title="JSON config (.mcp.json or Claude Desktop)"
          code={json}
          hint="Paste into .mcp.json in a project, or any client that takes an HTTP MCP server with headers. Don't commit a real token."
        />
        <p className="text-lg leading-tight text-ink-dim">
          {token ? 'These include your new token. Treat them like a password.' : 'Replace <YOUR_TOKEN> with a token you created.'}{' '}
          Lost a token? Revoke it and make a new one.
        </p>
      </div>
    </section>
  )
}
