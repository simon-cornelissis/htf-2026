import { DISTRICT_IDS, DISTRICTS, SITE_TYPES, type DistrictId, type SiteType } from './districts.ts'

/**
 * Layout of a district's zoomed-in city plan (viewBox 1000 x 640): its outline
 * scaled up from the world map, landmark positions, rooftops and streets.
 * Pure and seeded, so server and client render the same city.
 */
export const PLAN_W = 1000
export const PLAN_H = 640
const PAD = 40

type Pt = [number, number]

export type CityPlan = {
  outline: Pt[]
  /** SVG transform that maps world-map coordinates onto the plan. */
  worldTransform: string
  /** The same mapping as numbers: plan = world * scale + offset. */
  scale: number
  offset: Pt
  sites: Record<SiteType, Pt>
  roofs: { x: number; y: number; w: number; h: number; tone: number }[]
  streetsX: number[]
  streetsY: number[]
  /** Spots on streets where residents walk. */
  walkers: { x: number; y: number; axis: 'x' | 'y'; delay: number; speed: number }[]
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function distToEdge([x, y]: Pt, poly: Pt[]) {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]
    const [bx, by] = poly[i]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
  }
  return best
}

const cache = new Map<DistrictId, CityPlan>()

export function cityPlan(id: DistrictId): CityPlan {
  const hit = cache.get(id)
  if (hit) return hit

  const world = DISTRICTS[id].points.split(' ').map((p) => p.split(',').map(Number) as Pt)
  const xs = world.map((p) => p[0])
  const ys = world.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const bw = Math.max(...xs) - minX
  const bh = Math.max(...ys) - minY
  const scale = Math.min((PLAN_W - PAD * 2) / bw, (PLAN_H - PAD * 2) / bh)
  const ox = (PLAN_W - bw * scale) / 2 - minX * scale
  const oy = (PLAN_H - bh * scale) / 2 - minY * scale
  const outline = world.map(([x, y]) => [x * scale + ox, y * scale + oy] as Pt)

  // Landmarks: start near the middle (the square), then spread out as far as possible.
  const candidates: Pt[] = []
  for (let x = PAD; x < PLAN_W - PAD; x += 20) {
    for (let y = PAD; y < PLAN_H - PAD; y += 20) {
      const p: Pt = [x, y]
      if (inside(p, outline) && distToEdge(p, outline) > 70) candidates.push(p)
    }
  }
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length
  const order: SiteType[] = ['square', 'station', 'school', 'hospital', 'mall']
  const chosen: Pt[] = []
  chosen.push(candidates.reduce((a, b) => (Math.hypot(b[0] - cx, b[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy) ? b : a)))
  while (chosen.length < order.length) {
    chosen.push(
      candidates.reduce((a, b) => {
        const da = Math.min(...chosen.map((c) => Math.hypot(a[0] - c[0], a[1] - c[1])))
        const db = Math.min(...chosen.map((c) => Math.hypot(b[0] - c[0], b[1] - c[1])))
        return db > da ? b : a
      }),
    )
  }
  const sites = Object.fromEntries(order.map((t, i) => [t, chosen[i]])) as Record<SiteType, Pt>

  // Streets every ~90 units, rooftops in the blocks between them, kept clear of landmarks.
  const rand = rng(DISTRICT_IDS.indexOf(id) * 9973 + 17)
  const streetsX: number[] = []
  const streetsY: number[] = []
  for (let x = 70 + Math.floor(rand() * 40); x < PLAN_W; x += 85 + Math.floor(rand() * 30)) streetsX.push(x)
  for (let y = 60 + Math.floor(rand() * 40); y < PLAN_H; y += 80 + Math.floor(rand() * 25)) streetsY.push(y)

  const roofs: CityPlan['roofs'] = []
  const clearOfSites = (x: number, y: number) =>
    SITE_TYPES.every((t) => Math.hypot(x - sites[t][0], y - sites[t][1]) > 70)
  for (let x = 0; x < PLAN_W; x += 30) {
    for (let y = 0; y < PLAN_H; y += 30) {
      const onStreet = streetsX.some((s) => Math.abs(s - x - 12) < 18) || streetsY.some((s) => Math.abs(s - y - 12) < 16)
      if (onStreet || rand() < 0.35) continue
      const p: Pt = [x + 12, y + 12]
      if (!inside(p, outline) || distToEdge(p, outline) < 16 || !clearOfSites(p[0], p[1])) continue
      roofs.push({ x: x + 3, y: y + 3, w: 16 + Math.floor(rand() * 10), h: 14 + Math.floor(rand() * 10), tone: Math.floor(rand() * 3) })
    }
  }

  const walkers: CityPlan['walkers'] = []
  for (let i = 0; i < 80 && walkers.length < 40; i++) {
    const axis = rand() < 0.5 ? 'x' : 'y'
    const x = axis === 'y' ? streetsX[Math.floor(rand() * streetsX.length)] : 40 + rand() * (PLAN_W - 80)
    const y = axis === 'x' ? streetsY[Math.floor(rand() * streetsY.length)] : 40 + rand() * (PLAN_H - 80)
    if (!inside([x, y], outline) || distToEdge([x, y], outline) < 40) continue
    walkers.push({ x, y, axis, delay: -rand() * 8, speed: 5 + rand() * 6 })
  }

  const plan: CityPlan = {
    outline,
    worldTransform: `translate(${ox} ${oy}) scale(${scale})`,
    scale,
    offset: [ox, oy],
    sites,
    roofs,
    streetsX,
    streetsY,
    walkers,
  }
  cache.set(id, plan)
  return plan
}

/** Ground distance per plan unit: a city plan is about 1.5 km across. */
export const PLAN_METRES_PER_UNIT = 1.5
/** Ground distance per world-map unit (the world map squeezes things, so radii stay readable). */
export const WORLD_METRES_PER_UNIT = 8

/** Where a landmark sits on the world map. */
export function siteOnWorld(district: DistrictId, type: SiteType): Pt {
  const plan = cityPlan(district)
  const [x, y] = plan.sites[type]
  return [(x - plan.offset[0]) / plan.scale, (y - plan.offset[1]) / plan.scale]
}

/**
 * Shared-element zoom between the world map and a district's city plan.
 * The world map puts this name on an outline of the district, the district
 * page on its city-plan frame, and the browser morphs one into the other.
 */
export function districtTransitionName(id: DistrictId) {
  return `district-${id}`
}

/** The last district zoomed into, so the way back shrinks into the right outline. */
export const zoomMemory: { last?: DistrictId } = {}

/** A district's bounding box on the world map (viewBox 1000 x 640) in %, plus a viewBox that frames just its outline. */
export function districtBox(id: DistrictId) {
  const world = DISTRICTS[id].points.split(' ').map((p) => p.split(',').map(Number) as Pt)
  const xs = world.map((p) => p[0])
  const ys = world.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(...xs) - minX
  const h = Math.max(...ys) - minY
  const pct = (n: number) => `${+n.toFixed(3)}%`
  return {
    style: { left: pct((minX / 1000) * 100), top: pct((minY / 640) * 100), width: pct((w / 1000) * 100), height: pct((h / 640) * 100) },
    viewBox: `${minX} ${minY} ${w} ${h}`,
  }
}
