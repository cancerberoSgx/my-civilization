import { SpecialistType } from './types'
import type {
  City,
  CitizenAssignment,
  ProductionQueueItem,
  WorkedTile,
  BuildingDefinition,
} from './types'

// ── Citizen tile assignment ───────────────────────────────────────────────────

/**
 * Assigns the first unoccupied citizen (currently a specialist) to work a
 * specific tile. The tile must be in the city's cultural borders and not
 * already worked by another citizen.
 *
 * Returns the city unchanged if no available citizen exists or the tile is
 * already assigned.
 *
 * @param city    - Current city state
 * @param tileKey - Tile to work (y * mapWidth + x)
 * @returns Updated city
 */
export function assignCitizenToTile(city: City, tileKey: number): City {
  const alreadyWorked = city.citizenAssignments.some(
    a => a.kind === 'tile' && a.tileKey === tileKey,
  )
  if (alreadyWorked) return city

  const idx = city.citizenAssignments.findIndex(a => a.kind === 'specialist')
  if (idx === -1) return city  // No unassigned citizens

  const newAssignment: CitizenAssignment = { kind: 'tile', tileKey }
  return {
    ...city,
    citizenAssignments: replace(city.citizenAssignments, idx, newAssignment),
  }
}

/**
 * Unassigns a citizen from a tile, converting them to a default Scientist
 * specialist. The tile must currently be worked by this city.
 *
 * @param city    - Current city state
 * @param tileKey - Tile to stop working
 * @returns Updated city
 */
export function unassignCitizen(city: City, tileKey: number): City {
  const idx = city.citizenAssignments.findIndex(
    a => a.kind === 'tile' && a.tileKey === tileKey,
  )
  if (idx === -1) return city

  const newAssignment: CitizenAssignment = {
    kind:           'specialist',
    specialistType: SpecialistType.Scientist,
  }
  return {
    ...city,
    citizenAssignments: replace(city.citizenAssignments, idx, newAssignment),
  }
}

// ── Production queue ──────────────────────────────────────────────────────────

/**
 * Appends an item to the end of the city's production queue.
 *
 * Rejects silently if:
 *  - A building is already built in this city
 *  - The same building already appears in the queue
 *
 * @param city - Current city state
 * @param item - Item to add (must have accumulatedHammers = 0 for new entries)
 * @returns Updated city
 */
export function addToProductionQueue(city: City, item: ProductionQueueItem): City {
  if (item.kind === 'building') {
    if (city.builtBuildings.includes(item.buildingId)) return city
    if (city.productionQueue.some(q => q.kind === 'building' && q.buildingId === item.buildingId)) {
      return city
    }
  }
  return { ...city, productionQueue: [...city.productionQueue, item] }
}

/**
 * Removes the item at `index` from the production queue.
 * Accumulated hammers on the removed item are discarded.
 * Returns the city unchanged if the index is out of bounds.
 *
 * @param city  - Current city state
 * @param index - Zero-based position in the queue
 * @returns Updated city
 */
export function removeFromQueue(city: City, index: number): City {
  const q = city.productionQueue
  if (index < 0 || index >= q.length) return city
  return {
    ...city,
    productionQueue: [...q.slice(0, index), ...q.slice(index + 1)],
  }
}

/**
 * Moves a queue item from `fromIndex` to `toIndex`.
 * Returns the city unchanged if either index is out of bounds or equal.
 *
 * @param city      - Current city state
 * @param fromIndex - Current position of the item
 * @param toIndex   - Desired position after the move
 * @returns Updated city
 */
export function reorderQueue(city: City, fromIndex: number, toIndex: number): City {
  const q = city.productionQueue
  if (
    fromIndex < 0 || fromIndex >= q.length ||
    toIndex   < 0 || toIndex   >= q.length ||
    fromIndex === toIndex
  ) {
    return city
  }
  const arr  = [...q]
  const item = arr.splice(fromIndex, 1)[0]!
  arr.splice(toIndex, 0, item)
  return { ...city, productionQueue: arr }
}

// ── Specialist assignment ─────────────────────────────────────────────────────

/**
 * Converts the first available citizen (one that is not already this specialist
 * type) into the requested specialist type, subject to slot availability from
 * buildings.
 *
 * @param city      - Current city state
 * @param type      - Target specialist type
 * @param buildings - Building definitions (used to check max slot counts)
 * @returns Updated city, or unchanged city if no slot or no available citizen
 */
export function assignSpecialist(
  city:      City,
  type:      SpecialistType,
  buildings: readonly BuildingDefinition[],
): City {
  const maxSlots = getSpecialistSlotMax(type, buildings)
  const current  = city.citizenAssignments.filter(
    a => a.kind === 'specialist' && a.specialistType === type,
  ).length

  if (current >= maxSlots) return city  // All slots occupied

  // Take any citizen currently assigned to a different specialist type
  const idx = city.citizenAssignments.findIndex(
    a => a.kind === 'specialist' && a.specialistType !== type,
  )
  if (idx === -1) return city

  const newAssignment: CitizenAssignment = { kind: 'specialist', specialistType: type }
  return {
    ...city,
    citizenAssignments: replace(city.citizenAssignments, idx, newAssignment),
  }
}

/**
 * Converts one specialist of `type` back to a default Scientist specialist.
 * Returns the city unchanged if no specialist of that type exists.
 *
 * @param city - Current city state
 * @param type - Specialist type to downgrade
 * @returns Updated city
 */
export function unassignSpecialist(city: City, type: SpecialistType): City {
  const idx = city.citizenAssignments.findIndex(
    a => a.kind === 'specialist' && a.specialistType === type,
  )
  if (idx === -1) return city

  const newAssignment: CitizenAssignment = {
    kind:           'specialist',
    specialistType: SpecialistType.Scientist,
  }
  return {
    ...city,
    citizenAssignments: replace(city.citizenAssignments, idx, newAssignment),
  }
}

// ── Auto-assign ───────────────────────────────────────────────────────────────

/**
 * Greedily assigns all citizens to tiles to maximise food first, then
 * production, then commerce. Citizens that cannot be assigned to a tile
 * (because there are not enough available tiles) become Scientist specialists.
 *
 * This mirrors the default Civ 4 auto-assign behaviour.
 *
 * @param city           - Current city state
 * @param availableTiles - All tiles within city borders with precomputed yields
 *                         (the city center tile should be excluded — it is
 *                         always worked for free and does not consume a citizen)
 * @returns City with fresh citizenAssignments
 */
export function autoAssignCitizens(city: City, availableTiles: readonly WorkedTile[]): City {
  if (city.population === 0) return city

  const sorted = [...availableTiles].sort((a, b) => {
    const dFood = b.yields.food       - a.yields.food
    if (dFood !== 0) return dFood
    const dProd = b.yields.production - a.yields.production
    if (dProd !== 0) return dProd
    return      b.yields.commerce    - a.yields.commerce
  })

  const newAssignments: CitizenAssignment[] = []

  for (let i = 0; i < city.population; i++) {
    if (i < sorted.length) {
      newAssignments.push({ kind: 'tile', tileKey: sorted[i]!.tileKey })
    } else {
      // Overflow citizens become Scientist specialists
      newAssignments.push({ kind: 'specialist', specialistType: SpecialistType.Scientist })
    }
  }

  return { ...city, citizenAssignments: newAssignments }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Returns the maximum number of specialists of `type` allowed by buildings. */
function getSpecialistSlotMax(
  type:      SpecialistType,
  buildings: readonly BuildingDefinition[],
): number {
  return buildings.reduce((total, b) => {
    const slot = b.specialistSlots.find(s => s.type === type)
    return total + (slot?.count ?? 0)
  }, 0)
}

/** Immutably replaces the element at `index` in a readonly array. */
function replace<T>(arr: readonly T[], index: number, value: T): readonly T[] {
  return [...arr.slice(0, index), value, ...arr.slice(index + 1)]
}
