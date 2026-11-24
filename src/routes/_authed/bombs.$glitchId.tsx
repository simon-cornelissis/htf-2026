import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { DefuseGame } from '#/components/DefuseGame.tsx'
import { getBomb } from '#/lib/bombs.functions.ts'

export const Route = createFileRoute('/_authed/bombs/$glitchId')({
  loader: async ({ params }) => {
    const bomb = await getBomb({ data: params.glitchId })
    if (!bomb) throw notFound()
    return bomb
  },
  head: ({ params }) => ({ meta: [{ title: `Defuse ${params.glitchId} · Guardians of the Grid` }] }),
  notFoundComponent: () => (
    <div className="crt mx-auto max-w-xl px-8 py-16 text-center text-2xl">
      <p className="text-5xl text-phos">NO DEVICE</p>
      <p className="mt-3 text-phos-dim">There’s no planted device on this file.</p>
      <Link to="/" className="btn mt-8 inline-block px-6 py-3 text-sm">Back to the map</Link>
    </div>
  ),
  component: BombPage,
})

function BombPage() {
  const bomb = Route.useLoaderData()
  return <DefuseGame key={bomb.glitchId} initial={bomb} />
}
