import { SpecialistType } from './types'
import type {
  City,
  CityTurnContext,
  CitizenAssignment,
  ProductionQueueItem,
  GreatPersonPool,
  BuildingDefinition,
  BuildingId,
} from './types'
import { getBuildingDef, getUnitDef } from './definitions'
import { calculateCityYields } from './yields'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Food consumed per citizen per turn. */
const FOOD_PER_CITIZEN = 2

// ── Internal formulas ─────────────────────────────────────────────────────────

/** Food box threshold to reach before the city grows (Civ 4 formula). */
function foodThreshold(population: number): number {
  return 20 + 10 * population
}

/**
 * GPP threshold for the next Great Person birth.
 * Doubles with each consecutive birth from this city: 100, 200, 400, 800…
 */
function gppThreshold(greatPeopleBorn: number): number {
  return 100 * Math.pow(2, greatPeopleBorn)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Processes one full turn for a city and returns the updated state.
 *
 * Turn order (matches the Civ 4 per-city sequence):
 * 1. Calculate total yields from tiles, specialists, and buildings
 * 2. Advance the production queue — complete the current item if possible
 * 3. Advance the food box — trigger growth or starvation as needed
 * 4. Advance the Great Person pool — trigger a birth if threshold is reached
 * 5. Accumulate culture
 *
 * This function is pure: the input city is never mutated.
 *
 * @param city    - Current city state
 * @param context - Precomputed tile yields, building definitions, and commerce rates
 * @returns New city state after the turn
 */
export function processCityTurn(city: City, context: CityTurnContext): City {
  const yields = calculateCityYields(
    city,
    context.centerTileYields,
    context.workedTiles,
    context.buildings,
    context.commerceRates,
  )

  // 2. Production queue
  const { nextQueue, completedItem } = advanceProductionQueue(
    city.productionQueue,
    yields.production,
  )

  const builtBuildings: readonly BuildingId[] =
    completedItem?.kind === 'building'
      ? [...city.builtBuildings, completedItem.buildingId]
      : city.builtBuildings

  // 3. Food box
  const { nextPopulation, nextStoredFood, nextAssignments } = advanceFood(
    city.population,
    city.storedFood,
    city.citizenAssignments,
    yields.food,
    context.buildings,
  )

  // 4. Great Person pool
  const gppSources = computeGPPSources(city.citizenAssignments)
  const nextGPPool = advanceGPPool(city.greatPersonPool, yields.gpp, gppSources)

  // 5. Culture
  const nextStoredCulture = city.storedCulture + yields.culture

  return {
    ...city,
    population:         nextPopulation,
    storedFood:         nextStoredFood,
    citizenAssignments: nextAssignments,
    productionQueue:    nextQueue,
    builtBuildings,
    greatPersonPool:    nextGPPool,
    storedCulture:      nextStoredCulture,
  }
}

// ── Production helpers ────────────────────────────────────────────────────────

interface ProductionResult {
  readonly nextQueue:     readonly ProductionQueueItem[]
  readonly completedItem: ProductionQueueItem | null
}

function advanceProductionQueue(
  queue:   readonly ProductionQueueItem[],
  hammers: number,
): ProductionResult {
  if (queue.length === 0 || hammers <= 0) {
    return { nextQueue: queue, completedItem: null }
  }

  const head = queue[0]
  const rest = queue.slice(1)
  const advanced = addHammers(head, hammers)

  if (advanced.accumulatedHammers >= getItemCost(advanced)) {
    return { nextQueue: rest, completedItem: advanced }
  }
  return { nextQueue: [advanced, ...rest], completedItem: null }
}

/** Returns a new queue item with hammers added (type-safe over the union). */
function addHammers(item: ProductionQueueItem, amount: number): ProductionQueueItem {
  if (item.kind === 'building') {
    return {
      kind:               'building',
      buildingId:         item.buildingId,
      accumulatedHammers: item.accumulatedHammers + amount,
    }
  }
  return {
    kind:               'unit',
    unitTypeId:         item.unitTypeId,
    accumulatedHammers: item.accumulatedHammers + amount,
  }
}

/** Returns the hammer cost of a production queue item. */
function getItemCost(item: ProductionQueueItem): number {
  try {
    return item.kind === 'building'
      ? getBuildingDef(item.buildingId).cost
      : getUnitDef(item.unitTypeId).cost
  } catch {
    return Infinity
  }
}

// ── Food and growth helpers ───────────────────────────────────────────────────

interface FoodResult {
  readonly nextPopulation: number
  readonly nextStoredFood: number
  readonly nextAssignments: readonly CitizenAssignment[]
}

function advanceFood(
  population:  number,
  storedFood:  number,
  assignments: readonly CitizenAssignment[],
  totalFood:   number,
  buildings:   readonly BuildingDefinition[],
): FoodResult {
  const netFood  = totalFood - FOOD_PER_CITIZEN * population
  const nextFood = storedFood + netFood
  const threshold = foodThreshold(population)

  // Growth
  if (nextFood >= threshold) {
    const hasGranary = buildings.some(b => b.granaryEffect)
    const carry      = hasGranary ? Math.floor(threshold / 2) : 0
    const newPop     = population + 1
    // New citizen defaults to Scientist; the player can reassign manually or
    // via autoAssignCitizens.
    const newAssignments: readonly CitizenAssignment[] = [
      ...assignments,
      { kind: 'specialist', specialistType: SpecialistType.Scientist } as const,
    ]
    return {
      nextPopulation: newPop,
      nextStoredFood: carry,
      nextAssignments: newAssignments,
    }
  }

  // Starvation: food box would drop below zero
  if (nextFood < 0) {
    if (population > 1) {
      // Remove the last citizen assignment
      return {
        nextPopulation:  population - 1,
        nextStoredFood:  0,
        nextAssignments: assignments.slice(0, -1),
      }
    }
    // Cannot starve below population 1 — just zero the food box
    return { nextPopulation: population, nextStoredFood: 0, nextAssignments: assignments }
  }

  return { nextPopulation: population, nextStoredFood: nextFood, nextAssignments: assignments }
}

// ── Great Person helpers ──────────────────────────────────────────────────────

/**
 * Counts GPP contributed per specialist type in the current turn
 * (2 GPP per specialist, matching SPECIALIST_YIELDS in yields.ts).
 */
function computeGPPSources(
  assignments: readonly CitizenAssignment[],
): Partial<Record<SpecialistType, number>> {
  const sources: Partial<Record<SpecialistType, number>> = {}
  for (const a of assignments) {
    if (a.kind === 'specialist') {
      sources[a.specialistType] = (sources[a.specialistType] ?? 0) + 2
    }
  }
  return sources
}

function advanceGPPool(
  pool:        GreatPersonPool,
  turnGPP:     number,
  turnSources: Readonly<Partial<Record<SpecialistType, number>>>,
): GreatPersonPool {
  // Accumulate sources
  const newSources: Partial<Record<SpecialistType, number>> = { ...pool.sources }
  for (const key of Object.keys(turnSources) as SpecialistType[]) {
    const pts = turnSources[key]
    if (pts !== undefined) {
      newSources[key] = (newSources[key] ?? 0) + pts
    }
  }

  const newPoints  = pool.points + turnGPP
  const threshold  = gppThreshold(pool.greatPeopleBorn)

  if (newPoints >= threshold) {
    // Great Person born — carry over excess, reset sources, increment counter
    return {
      points:          newPoints - threshold,
      greatPeopleBorn: pool.greatPeopleBorn + 1,
      sources:         {},
    }
  }

  return {
    points:          newPoints,
    greatPeopleBorn: pool.greatPeopleBorn,
    sources:         newSources,
  }
}
