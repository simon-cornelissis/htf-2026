// Turn the loose names an LLM uses ("the Rustmarket square", "Broken Bridge Halt")
// into the ids the server functions expect.
import {
  DISTRICT_IDS,
  DISTRICTS,
  SITE_META,
  SITE_TYPES,
  parseSiteId,
  siteId,
  type DistrictId,
  type SiteId,
  type SiteType,
} from '#/lib/districts.ts'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const DISTRICT_LIST = DISTRICT_IDS.map((id) => `${id} (${DISTRICTS[id].name})`).join(', ')

export function resolveDistrict(input: string): DistrictId {
  const q = norm(input)
  const hit = DISTRICT_IDS.find((id) => norm(id) === q || norm(DISTRICTS[id].name) === q || norm(DISTRICTS[id].name.replace(/^the /i, '')) === q)
  if (!hit) throw new Error(`Unknown district "${input}". Districts: ${DISTRICT_LIST}.`)
  return hit
}

export type ResolvedSite = { siteId: SiteId; district: DistrictId; type: SiteType; name: string }

const resolved = (district: DistrictId, type: SiteType): ResolvedSite => ({
  siteId: siteId(district, type),
  district,
  type,
  name: DISTRICTS[district].sites[type],
})

/**
 * Accepts a site id ("rustmarket:square"), a landmark name ("Barter Ring"),
 * or district + site type in words ("Rustmarket square", "the spire hospital").
 */
export function resolveSite(input: string): ResolvedSite {
  const parsed = parseSiteId(input.trim())
  if (parsed) return resolved(parsed.district, parsed.type)

  const q = norm(input)
  for (const d of DISTRICT_IDS) {
    for (const t of SITE_TYPES) {
      if (norm(DISTRICTS[d].sites[t]) === q) return resolved(d, t)
    }
  }

  const words = ` ${q} `
  const district = DISTRICT_IDS.find(
    (d) => words.includes(` ${norm(d)} `) || words.includes(` ${norm(DISTRICTS[d].name.replace(/^the /i, ''))} `),
  )
  const typeWords: Record<SiteType, string[]> = {
    station: ['station', 'train station', 'halt', 'stop', 'terminus', 'junction', 'depot'],
    school: ['school', 'academy'],
    hospital: ['hospital', 'clinic', 'infirmary', 'ward'],
    square: ['square', 'plaza', 'ring'],
    mall: ['mall', 'shopping centre', 'shopping center', 'market', 'arcade', 'bazaar', 'stalls'],
  }
  const type = SITE_TYPES.find((t) => [...typeWords[t], norm(SITE_META[t].label)].some((w) => words.includes(` ${w} `)))
  if (district && type) return resolved(district, type)

  throw new Error(
    `Couldn't find a site called "${input}". Use a site id like "rustmarket:square" (district:type, types: ${SITE_TYPES.join(', ')}), ` +
      'or an exact landmark name. Call list_districts to see every site.',
  )
}

export function siteLabel(id: string | null | undefined): string | null {
  const p = parseSiteId(id)
  return p ? `${DISTRICTS[p.district].sites[p.type]} (${SITE_META[p.type].label}, ${DISTRICTS[p.district].name})` : null
}
