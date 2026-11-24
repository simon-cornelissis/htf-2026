/**
 * The districts of Achrona, as drawn on the map (viewBox 1000 x 640).
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

export type District = {
  id: DistrictId
  name: string
  /** One line of flavour, shown in the district intel panel. */
  lore: string
  points: string
  /** Where the label and glitch markers sit. */
  center: [number, number]
}

export const DISTRICTS: Record<DistrictId, District> = {
  spire: {
    id: 'spire',
    name: 'The Spire',
    lore: 'Old seat of the council. Ivy has eaten the bell tower.',
    points: '140,120 330,70 420,200 300,290 150,260',
    center: [270, 180],
  },
  archive: {
    id: 'archive',
    name: 'Archive Vaults',
    lore: 'Sealed stacks of every timeline. Doors hum at night.',
    points: '330,70 560,60 600,190 420,200',
    center: [480, 130],
  },
  clockworks: {
    id: 'clockworks',
    name: 'Clockworks',
    lore: 'The gears that keep Achrona’s time. Mostly.',
    points: '560,60 800,100 860,240 700,280 600,190',
    center: [720, 170],
  },
  rustmarket: {
    id: 'rustmarket',
    name: 'Rustmarket',
    lore: 'Scrap stalls and echo traders under corrugated roofs.',
    points: '150,260 300,290 320,430 170,470 110,360',
    center: [215, 370],
  },
  greenhold: {
    id: 'greenhold',
    name: 'Greenhold',
    lore: 'The overgrown heart. The river splits it in two.',
    points: '300,290 420,200 600,190 700,280 620,400 420,420 320,430',
    center: [500, 330],
  },
  mirewells: {
    id: 'mirewells',
    name: 'Mire Wells',
    lore: 'Where the magic reserves pool. Marsh lights everywhere.',
    points: '700,280 860,240 900,400 760,470 620,400',
    center: [770, 360],
  },
  ashfield: {
    id: 'ashfield',
    name: 'Ashfield',
    lore: 'Burnt-out outskirts. First place the Desync hit.',
    points: '170,470 320,430 420,420 460,570 250,580',
    center: [325, 505],
  },
  oldreach: {
    id: 'oldreach',
    name: 'Old Reach',
    lore: 'Collapsed bridges and the southern watchposts.',
    points: '420,420 620,400 760,470 700,590 460,570',
    center: [590, 500],
  },
}

export const isDistrictId = (value: unknown): value is DistrictId =>
  DISTRICT_IDS.includes(value as DistrictId)
