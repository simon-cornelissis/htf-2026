import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * Page changes run through the View Transitions API (styled in styles.css).
 * Only real page changes get one: filter / search-param updates stay instant.
 * The router only honours a `types` callback where the browser supports
 * view-transition types, and would otherwise transition every navigation,
 * so where types are missing (or there's no API at all) it's simply off and
 * the pages fall back to their own small entry animations.
 */
type ViewTransitionOptions = Exclude<
  NonNullable<Parameters<typeof createTanStackRouter>[0]>['defaultViewTransition'],
  boolean | undefined
>

function viewTransitions(): ViewTransitionOptions | false {
  if (typeof window === 'undefined' || typeof document.startViewTransition !== 'function') return false
  if (!window.CSS?.supports?.('selector(:active-view-transition-type(a))')) return false
  return {
    types: ({ fromLocation, toLocation, pathChanged }) => {
      if (!fromLocation || !pathChanged) return false
      const from = fromLocation.pathname
      const to = toLocation.pathname
      if (from === '/' && to.startsWith('/districts/')) return ['zoom-in']
      if (from.startsWith('/districts/') && to === '/') return ['zoom-out']
      return ['page']
    },
  }
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultViewTransition: viewTransitions(),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
