/**
 * The districts of Achrona, as drawn on the world map (viewBox 1000 x 640).
 * Polygons share corners so the city reads as one landmass.
 */
export const DISTRICT_IDS = [
  'spire',
  'archive',
  'clockworks',
  'rustmarket',
  'greenhold',
  'mirewells',
  'ashfield',
  'oldreach',
] as const

export type DistrictId = (typeof DISTRICT_IDS)[number]

/** Landmarks every district has. Shown on the zoomed-in city plan. */
export const SITE_TYPES = ['station', 'school', 'hospital', 'square', 'mall'] as const

export type SiteType = (typeof SITE_TYPES)[number]

export const SITE_META: Record<SiteType, { label: string; hint: string }> = {
  station: { label: 'Train station', hint: 'Commuters pass through every hour.' },
  school: { label: 'School', hint: 'Children and parents: news spreads fast here.' },
  hospital: { label: 'Hospital', hint: 'The sick and their families. Easily frightened.' },
  square: { label: 'Square', hint: 'Where crowds gather and rumours start.' },
  mall: { label: 'Shopping centre', hint: 'Daily supplies. Shortages hit hard.' },
}

/** Site id as stored on glitches and operations, e.g. "clockworks:station". */
export type SiteId = `${DistrictId}:${SiteType}`

export const siteId = (district: DistrictId, type: SiteType): SiteId => `${district}:${type}`

export function parseSiteId(value: unknown): { district: DistrictId; type: SiteType } | null {
  if (typeof value !== 'string') return null
  const [district, type] = value.split(':')
  if (!isDistrictId(district) || !SITE_TYPES.includes(type as SiteType)) return null
  return { district, type: type as SiteType }
}

/** How a district's residents feel with nothing going on. 0–100. */
export type Mood = { happiness: number; fear: number; anxiety: number }

export type District = {
  id: DistrictId
  name: string
  /** One line of flavour, shown in the district intel panel. */
  lore: string
  points: string
  /** Where the label and glitch markers sit. */
  center: [number, number]
  population: number
  baseline: Mood
  sites: Record<SiteType, string>
}

export const DISTRICTS: Record<DistrictId, District> = {
  spire: {
    id: 'spire',
    name: 'The Spire',
    lore: 'Old seat of the council. Ivy has eaten the bell tower.',
    points: '140,120 330,70 420,200 300,290 150,260',
    center: [270, 180],
    population: 4200,
    baseline: { happiness: 64, fear: 18, anxiety: 22 },
    sites: {
      station: 'Bell Tower Halt',
      school: 'Council Academy',
      hospital: 'St. Verity Infirmary',
      square: 'Oath Square',
      mall: 'The Gilded Arcade',
    },
  },
  archive: {
    id: 'archive',
    name: 'Archive Vaults',
    lore: 'Sealed stacks of every timeline. Doors hum at night.',
    points: '330,70 560,60 600,190 420,200',
    center: [480, 130],
    population: 2600,
    baseline: { happiness: 58, fear: 20, anxiety: 26 },
    sites: {
      station: 'Vault Line Terminus',
      school: 'Scriveners’ School',
      hospital: 'Quiet Ward',
      square: 'Index Plaza',
      mall: 'Paper Market',
    },
  },
  clockworks: {
    id: 'clockworks',
    name: 'Clockworks',
    lore: 'The gears that keep Achrona’s time. Mostly.',
    points: '560,60 800,100 860,240 700,280 600,190',
    center: [720, 170],
    population: 5100,
    baseline: { happiness: 60, fear: 16, anxiety: 24 },
    sites: {
      station: 'Clockworks Central',
      school: 'Apprentice Hall',
      hospital: 'Gearwright Clinic',
      square: 'Tower Gate Square',
      mall: 'Cog Street Exchange',
    },
  },
  rustmarket: {
    id: 'rustmarket',
    name: 'Rustmarket',
    lore: 'Scrap stalls and echo traders under corrugated roofs.',
    points: '150,260 300,290 320,430 170,470 110,360',
    center: [215, 370],
    population: 6800,
    baseline: { happiness: 55, fear: 22, anxiety: 30 },
    sites: {
      station: 'Scrapyard Junction',
      school: 'Tin Roof School',
      hospital: 'Patchwork Clinic',
      square: 'Barter Ring',
      mall: 'The Long Stalls',
    },
  },
  greenhold: {
    id: 'greenhold',
    name: 'Greenhold',
    lore: 'The overgrown heart. The river splits it in two.',
    points: '300,290 420,200 600,190 700,280 620,400 420,420 320,430',
    center: [500, 330],
    population: 9400,
    baseline: { happiness: 70, fear: 12, anxiety: 18 },
    sites: {
      station: 'Riverside Station',
      school: 'Greenhold Commons School',
      hospital: 'Mossgate Hospital',
      square: 'Fountain Square',
      mall: 'Canopy Mall',
    },
  },
  mirewells: {
    id: 'mirewells',
    name: 'Mire Wells',
    lore: 'Where the magic reserves pool. Marsh lights everywhere.',
    points: '700,280 860,240 900,400 760,470 620,400',
    center: [770, 360],
    population: 3300,
    baseline: { happiness: 57, fear: 24, anxiety: 28 },
    sites: {
      station: 'Wellhead Stop',
      school: 'Marshlight School',
      hospital: 'Reservoir Sanatorium',
      square: 'Lantern Square',
      mall: 'Bog Market',
    },
  },
  ashfield: {
    id: 'ashfield',
    name: 'Ashfield',
    lore: 'Burnt-out outskirts. First place the Desync hit.',
    points: '170,470 320,430 420,420 460,570 250,580',
    center: [325, 505],
    population: 1900,
    baseline: { happiness: 42, fear: 34, anxiety: 38 },
    sites: {
      station: 'Old Depot',
      school: 'Cinder School',
      hospital: 'Field Hospital 3',
      square: 'Ember Square',
      mall: 'Ration Hall',
    },
  },
  oldreach: {
    id: 'oldreach',
    name: 'Old Reach',
    lore: 'Collapsed bridges and the southern watchposts.',
    points: '420,420 620,400 760,470 700,590 460,570',
    center: [590, 500],
    population: 3700,
    baseline: { happiness: 52, fear: 26, anxiety: 30 },
    sites: {
      station: 'Broken Bridge Halt',
      school: 'Watchpost School',
      hospital: 'Southern Mercy',
      square: 'Muster Square',
      mall: 'Reach Bazaar',
    },
  },
}

export function isDistrictId(value: unknown): value is DistrictId {
  return DISTRICT_IDS.includes(value as DistrictId)
}

export function siteName(id: string | null | undefined): string | null {
  const parsed = parseSiteId(id)
  return parsed ? DISTRICTS[parsed.district].sites[parsed.type] : null
}
