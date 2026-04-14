import { SpecialistType } from './types'
import type {
  City,
  CityOutput,
  TileYield,
  WorkedTile,
  BuildingDefinition,
  CommerceRates,
} from './types'

// ── Specialist base yields ────────────────────────────────────────────────────

interface SpecialistYield {
  production: number
  science:    number
  gold:       number
  culture:    number
  /** Great People Points generated per turn. */
  gpp:        number
}

/**
 * Per-turn yield contributed by a single specialist of each type.
 * These are fixed values that do not change with buildings.
 */
const SPECIALIST_YIELDS: Record<SpecialistType, SpecialistYield> = {
  [SpecialistType.Scientist]: { production: 0, science: 3, gold: 0, culture: 0, gpp: 2 },
  [SpecialistType.Merchant]:  { production: 0, science: 0, gold: 3, culture: 0, gpp: 2 },
  [SpecialistType.Engineer]:  { production: 2, science: 0, gold: 0, culture: 0, gpp: 2 },
  [SpecialistType.Artist]:    { production: 0, science: 0, gold: 0, culture: 2, gpp: 2 },
  [SpecialistType.Priest]:    { production: 0, science: 0, gold: 1, culture: 1, gpp: 2 },
}

/**
 * Returns the fixed per-turn yield for a single specialist of the given type.
 */
export function getSpecialistYield(type: SpecialistType): SpecialistYield {
  return SPECIALIST_YIELDS[type]
}

// ── City yield calculator ─────────────────────────────────────────────────────

/**
 * Calculates the total per-turn city output.
 *
 * Computation order:
 * 1. Sum tile yields: city center (free) + each citizen-worked tile
 * 2. Sum specialist yields for all specialist citizens
 * 3. Add building flat yield bonuses
 * 4. Apply building percentage bonuses to production, food
 * 5. Split raw commerce into science / gold / culture via player rates
 * 6. Apply building percentage bonuses to science, gold, culture
 *
 * This function is pure — no side effects, no mutations.
 *
 * @param city             - Current city state (used for citizenAssignments)
 * @param centerTileYields - Base yields of the city center tile (always free)
 * @param workedTiles      - Precomputed yields for tiles worked by citizens
 *                           (each entry corresponds to a 'tile' assignment)
 * @param buildings        - Definitions of all buildings currently in the city
 * @param commerceRates    - Player slider for science / gold / culture split
 * @returns Full city output for the turn
 */
export function calculateCityYields(
  city:              City,
  centerTileYields:  TileYield,
  workedTiles:       readonly WorkedTile[],
  buildings:         readonly BuildingDefinition[],
  commerceRates:     CommerceRates,
): CityOutput {
  // ── 1. Base tile yields ──────────────────────────────────────────────────
  let food       = centerTileYields.food
  let production = centerTileYields.production
  let commerce   = centerTileYields.commerce

  // Build a lookup for O(1) tile access
  const tilesByKey = new Map(workedTiles.map(t => [t.tileKey, t]))

  for (const a of city.citizenAssignments) {
    if (a.kind === 'tile') {
      const tile = tilesByKey.get(a.tileKey)
      if (tile !== undefined) {
        food       += tile.yields.food
        production += tile.yields.production
        commerce   += tile.yields.commerce
      }
    }
  }

  // ── 2. Specialist yields ─────────────────────────────────────────────────
  let science = 0
  let gold    = 0
  let culture = 0
  let gpp     = 0

  for (const a of city.citizenAssignments) {
    if (a.kind === 'specialist') {
      const sy = SPECIALIST_YIELDS[a.specialistType]
      production += sy.production
      science    += sy.science
      gold       += sy.gold
      culture    += sy.culture
      gpp        += sy.gpp
    }
  }

  // ── 3. Building flat bonuses ─────────────────────────────────────────────
  for (const b of buildings) {
    food       += b.flatYields.food       ?? 0
    production += b.flatYields.production ?? 0
    commerce   += b.flatYields.commerce   ?? 0
    science    += b.flatYields.science    ?? 0
    gold       += b.flatYields.gold       ?? 0
    culture    += b.flatYields.culture    ?? 0
    gpp        += b.flatYields.gpp        ?? 0
  }

  // ── 4. Building percent bonuses on food and production ───────────────────
  let foodPct       = 0
  let productionPct = 0
  for (const b of buildings) {
    foodPct       += b.percentYields.food       ?? 0
    productionPct += b.percentYields.production ?? 0
  }
  if (foodPct > 0)       food       = Math.floor(food       * (1 + foodPct       / 100))
  if (productionPct > 0) production = Math.floor(production * (1 + productionPct / 100))

  // ── 5. Commerce split ────────────────────────────────────────────────────
  const commerceToScience = Math.floor(commerce * commerceRates.scienceRate / 100)
  const commerceToGold    = Math.floor(commerce * commerceRates.goldRate    / 100)
  const commerceToCulture = commerce - commerceToScience - commerceToGold  // remainder

  science += commerceToScience
  gold    += commerceToGold
  culture += commerceToCulture

  // ── 6. Building percent bonuses on science, gold, culture ────────────────
  let sciencePct = 0
  let goldPct    = 0
  let culturePct = 0
  for (const b of buildings) {
    sciencePct += b.percentYields.science ?? 0
    goldPct    += b.percentYields.gold    ?? 0
    culturePct += b.percentYields.culture ?? 0
  }
  if (sciencePct > 0) science = Math.floor(science * (1 + sciencePct / 100))
  if (goldPct    > 0) gold    = Math.floor(gold    * (1 + goldPct    / 100))
  if (culturePct > 0) culture = Math.floor(culture * (1 + culturePct / 100))

  return { food, production, commerce, science, gold, culture, gpp }
}
