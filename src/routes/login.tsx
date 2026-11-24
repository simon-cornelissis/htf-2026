import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Seal, Tube, Wires } from '#/components/ui/Seal.tsx'
import { getMe, login } from '#/lib/auth.functions.ts'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await getMe()) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Guardians of the Grid' }] }),
  component: LoginPage,
})

const DEMO_CODENAMES = ['COMMANDER', 'DEFENDER1', 'DEFENDER2']

const BOOT = [
  'ACHRONA REGIONAL TERMINAL  v0.41',
  'MEM CHECK ........ 640K OK',
  'GRID UPLINK ...... WEAK',
  'DESYNC STATUS .... SPREADING',
]

function LoginPage() {
  const router = useRouter()
  const [codename, setCodename] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!codename.trim() || !password) {
      setError('Enter your codename and passphrase.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await login({ data: { codename, password } })
      await router.invalidate()
      await router.navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.')
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-8">
      <form onSubmit={onSubmit} noValidate className="metal rivets relative w-full max-w-5xl p-4 sm:p-6">
        {/* Nameplate */}
        <div className="mb-4 flex items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3">
            <span className="inset flex size-12 items-center justify-center bg-metal-lo">
              <Seal className="size-9" />
            </span>
            <h1 className="stamp text-xl font-bold sm:text-2xl">Guardians of the Grid</h1>
          </div>
          <div className="hazard hidden h-8 w-40 sm:block" aria-hidden="true" />
        </div>

        <div className="grid gap-5 md:grid-cols-[5.5rem_minmax(0,1fr)_11rem]">
          {/* Exposed hardware */}
          <div className="hidden flex-col items-center justify-between gap-3 md:flex" aria-hidden="true">
            <div className="flex gap-1">
              <Tube className="h-24 w-9" />
              <Tube className="h-20 w-8" />
            </div>
            <div className="grille inset size-20" />
          </div>

          {/* The monitor */}
          <div className="crt min-h-[22rem] p-6 text-[22px] leading-snug sm:p-8">
            <div className="text-phos-dim">
              {BOOT.map((line) => <div key={line}>{line}</div>)}
            </div>
            <p className="mt-4 text-phos">
              GREETINGS, WANDERER. THE GRID STILL NEEDS GUARDIANS.
              IDENTIFY YOURSELF TO CONTINUE.
            </p>

            <label className="mt-6 flex items-center gap-3">
              <span className="w-40 shrink-0 text-phos-dim">&gt; CODENAME:</span>
              <input
                autoFocus
                autoComplete="username"
                value={codename}
                onChange={(e) => { setCodename(e.target.value); setError(null) }}
                placeholder="DEFENDER1_"
                className="relative z-10 w-full border-b-2 border-phos-dim/60 bg-transparent text-phos uppercase caret-phos placeholder:text-phos-dim/70 focus:border-phos focus:outline-none"
              />
            </label>
            <label className="mt-3 flex items-center gap-3">
              <span className="w-40 shrink-0 text-phos-dim">&gt; PASSPHRASE:</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                className="relative z-10 w-full border-b-2 border-phos-dim/60 bg-transparent text-phos caret-phos focus:border-phos focus:outline-none"
              />
            </label>

            <div aria-live="polite" className="mt-4 min-h-7 text-[#ff7a5c]">
              {error ? `! ${error.toUpperCase()}` : pending ? <span className="text-phos animate-blink">VERIFYING...</span> : null}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <button type="submit" disabled={pending} className="btn flex flex-col items-center gap-2 px-3 py-4 text-sm disabled:opacity-60">
              <span data-on="red" className="lamp size-7" aria-hidden="true" />
              Enter grid
            </button>

            {import.meta.env.DEV && (
              <div className="inset bg-metal-lo p-3">
                <p className="stamp mb-2 text-[10px] leading-snug">
                  Demo · pass <span className="text-white">guest</span>
                </p>
                <div className="flex flex-col gap-2">
                  {DEMO_CODENAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setCodename(name); setPassword('guest'); setError(null) }}
                      className="btn flex items-center justify-between px-2 py-1.5 text-[11px]"
                    >
                      {name}
                      <span data-on={name === 'COMMANDER' ? 'amber' : 'green'} className="lamp size-2" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <Wires className="pointer-events-none absolute -bottom-12 left-16 hidden h-14 w-28 md:block" />
      </form>
    </div>
  )
}
