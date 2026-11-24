import { createFileRoute, Outlet, redirect, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Shell } from '#/components/layout/Shell.tsx'
import { getMe } from '#/lib/auth.functions.ts'
import { getGlitches } from '#/lib/glitches.functions.ts'

/** Refetch the board this often, so echoes from other guardians show up. */
const REFRESH_MS = 15_000

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const guardian = await getMe()
    if (!guardian) throw redirect({ to: '/login' })
    return { guardian }
  },
  loader: () => getGlitches(),
  component: AuthedLayout,
})

function AuthedLayout() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.invalidate()
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}
