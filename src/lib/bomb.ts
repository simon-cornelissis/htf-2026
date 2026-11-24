/**
 * Planted devices: a commander operation that arms a bomb at a landmark.
 * Anyone signed in can try to defuse it by cutting wires in the right order,
 * following the steps in the manual, before the fuse runs out.
 * Pure and shared: the solution itself never leaves the server.
 */

/** How long the fuse burns once the device is armed. */
export const FUSE_SECONDS = 180
/** Each wrong cut burns this much extra fuse. */
export const STRIKE_PENALTY_SECONDS = 30
export const MAX_STRIKES = 3
/** Hero points for a defusal: base + 1 per second left on the fuse. */
export const DEFUSE_BASE_POINTS = 100

export const WIRE_COLORS = ['red', 'blue', 'yellow', 'green', 'white', 'black'] as const
export type WireColor = (typeof WIRE_COLORS)[number]

export const BOMB_OUTCOMES = ['DEFUSED', 'DETONATED'] as const
export type BombOutcome = (typeof BOMB_OUTCOMES)[number]

/** Stored on the operation. `solution` is server-only. */
export type BombPuzzle = {
  wires: WireColor[]
  /** Wire indices to cut, in order. */
  solution: number[]
  /** One instruction per step, in plain words. */
  manual: string[]
  /** Wire indices cut so far (correct ones only). */
  cut: number[]
  strikes: number
}

/** What clients see: everything except the solution. */
export type PublicBombPuzzle = Omit<BombPuzzle, 'solution'>

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Five distinct wires, three to cut in order, one written clue per step. */
export function generatePuzzle(seed: number): BombPuzzle {
  const rand = rng(seed)
  const pool = [...WIRE_COLORS]
  const wires: WireColor[] = []
  while (wires.length < 5) wires.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])

  // Fisher–Yates: sort() with a random comparator barely shuffles small arrays.
  const order = [0, 1, 2, 3, 4]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const solution = order.slice(0, 3)

  const manual = solution.map((idx, step) => {
    const kinds: (() => string | null)[] = [
      () => `Cut the ${wires[idx].toUpperCase()} wire.`,
      () => `Cut the ${ORDINAL[idx]} wire from the left.`,
      () => `Cut the ${ORDINAL[wires.length - 1 - idx]} wire from the right.`,
      () => (idx > 0 ? `Cut the wire directly right of the ${wires[idx - 1].toUpperCase()} wire.` : null),
      () => (idx < wires.length - 1 ? `Cut the wire directly left of the ${wires[idx + 1].toUpperCase()} wire.` : null),
    ]
    // The first step is always a plain colour clue so everyone can get started.
    if (step === 0) return kinds[0]()!
    for (let tries = 0; tries < 10; tries++) {
      const clue = kinds[1 + Math.floor(rand() * (kinds.length - 1))]()
      if (clue) return clue
    }
    return kinds[0]()!
  })

  return { wires, solution, manual, cut: [], strikes: 0 }
}

export function publicPuzzle(p: BombPuzzle): PublicBombPuzzle {
  const { solution: _hidden, ...rest } = p
  return rest
}
