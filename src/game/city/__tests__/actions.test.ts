import { describe, it, expect } from 'vitest'
import {
  assignCitizenToTile,
  unassignCitizen,
  addToProductionQueue,
  removeFromQueue,
  reorderQueue,
  assignSpecialist,
  unassignSpecialist,
  autoAssignCitizens,
} from '../actions'
import { SpecialistType } from '../types'
import type { ProductionQueueItem } from '../types'
import { B_GRANARY, B_LIBRARY, B_FORGE, getBuildingDef } from '../definitions'
import { UnitTypeId } from '../../../shared/types'
import { makeCity, workedTile, GRASS_YIELD, ZERO_YIELD } from './helpers'

// ── assignCitizenToTile ───────────────────────────────────────────────────────

describe('assignCitizenToTile', () => {
  it('converts the first specialist to a tile assignment', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Scientist }],
    })
    const next = assignCitizenToTile(city, 42)
    expect(next.citizenAssignments[0]).toEqual({ kind: 'tile', tileKey: 42 })
  })

  it('does not assign if the tile is already worked', () => {
    const city = makeCity({
      population: 2,
      citizenAssignments: [
        { kind: 'tile', tileKey: 42 },
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
      ],
    })
    const next = assignCitizenToTile(city, 42)
    expect(next).toBe(city)  // referential equality — no change
  })

  it('returns city unchanged when all citizens are on tiles', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 7 }],
    })
    const next = assignCitizenToTile(city, 99)
    expect(next).toBe(city)
  })

  it('does not mutate the original city', () => {
    const city = makeCity({ population: 1 })
    const next = assignCitizenToTile(city, 10)
    expect(city.citizenAssignments[0]?.kind).toBe('specialist')
    expect(next.citizenAssignments[0]?.kind).toBe('tile')
  })
})

// ── unassignCitizen ───────────────────────────────────────────────────────────

describe('unassignCitizen', () => {
  it('converts a tile assignment back to a Scientist specialist', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 42 }],
    })
    const next = unassignCitizen(city, 42)
    expect(next.citizenAssignments[0]).toEqual({
      kind:           'specialist',
      specialistType: SpecialistType.Scientist,
    })
  })

  it('returns city unchanged if the tile is not currently worked', () => {
    const city = makeCity({ population: 1 })
    const next = unassignCitizen(city, 999)
    expect(next).toBe(city)
  })
})

// ── addToProductionQueue ──────────────────────────────────────────────────────

describe('addToProductionQueue', () => {
  it('appends a new item to an empty queue', () => {
    const city = makeCity()
    const item: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 0,
    }
    const next = addToProductionQueue(city, item)
    expect(next.productionQueue).toHaveLength(1)
    expect(next.productionQueue[0]).toEqual(item)
  })

  it('appends multiple items in order', () => {
    const city = makeCity()
    const warrior: ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 0 }
    const archer:  ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Archer,  accumulatedHammers: 0 }
    const next = addToProductionQueue(addToProductionQueue(city, warrior), archer)
    expect(next.productionQueue).toHaveLength(2)
    expect((next.productionQueue[0] as Extract<ProductionQueueItem, { kind: 'unit' }>).unitTypeId)
      .toBe(UnitTypeId.Warrior)
  })

  it('rejects a building that is already built', () => {
    const city = makeCity({ builtBuildings: [B_GRANARY] })
    const item: ProductionQueueItem = { kind: 'building', buildingId: B_GRANARY, accumulatedHammers: 0 }
    const next = addToProductionQueue(city, item)
    expect(next).toBe(city)
  })

  it('rejects a building that is already in the queue', () => {
    const item: ProductionQueueItem = { kind: 'building', buildingId: B_GRANARY, accumulatedHammers: 0 }
    const city = makeCity({ productionQueue: [item] })
    const next = addToProductionQueue(city, { ...item, accumulatedHammers: 0 })
    expect(next.productionQueue).toHaveLength(1)
  })
})

// ── removeFromQueue ───────────────────────────────────────────────────────────

describe('removeFromQueue', () => {
  it('removes an item by index', () => {
    const items: ProductionQueueItem[] = [
      { kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 5 },
      { kind: 'unit', unitTypeId: UnitTypeId.Archer,  accumulatedHammers: 0 },
    ]
    const city = makeCity({ productionQueue: items })
    const next = removeFromQueue(city, 0)
    expect(next.productionQueue).toHaveLength(1)
    expect((next.productionQueue[0] as Extract<ProductionQueueItem, { kind: 'unit' }>).unitTypeId)
      .toBe(UnitTypeId.Archer)
  })

  it('returns city unchanged for an out-of-bounds index', () => {
    const city = makeCity()
    expect(removeFromQueue(city, 0)).toBe(city)
    expect(removeFromQueue(city, -1)).toBe(city)
  })

  it('discards accumulated hammers of the removed item', () => {
    const item: ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 50 }
    const next = removeFromQueue(makeCity({ productionQueue: [item] }), 0)
    expect(next.productionQueue).toHaveLength(0)
  })
})

// ── reorderQueue ──────────────────────────────────────────────────────────────

describe('reorderQueue', () => {
  const warrior: ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 0 }
  const archer:  ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Archer,  accumulatedHammers: 0 }
  const settler: ProductionQueueItem = { kind: 'unit', unitTypeId: UnitTypeId.Settler, accumulatedHammers: 0 }

  it('moves an item forward in the queue', () => {
    const city = makeCity({ productionQueue: [warrior, archer, settler] })
    const next = reorderQueue(city, 2, 0)  // settler → front
    expect((next.productionQueue[0] as Extract<ProductionQueueItem, { kind: 'unit' }>).unitTypeId)
      .toBe(UnitTypeId.Settler)
  })

  it('moves an item backward in the queue', () => {
    const city = makeCity({ productionQueue: [warrior, archer, settler] })
    const next = reorderQueue(city, 0, 2)  // warrior → back
    expect((next.productionQueue[2] as Extract<ProductionQueueItem, { kind: 'unit' }>).unitTypeId)
      .toBe(UnitTypeId.Warrior)
  })

  it('returns city unchanged when fromIndex === toIndex', () => {
    const city = makeCity({ productionQueue: [warrior, archer] })
    expect(reorderQueue(city, 1, 1)).toBe(city)
  })

  it('returns city unchanged for out-of-bounds indices', () => {
    const city = makeCity({ productionQueue: [warrior] })
    expect(reorderQueue(city, 0, 5)).toBe(city)
    expect(reorderQueue(city, -1, 0)).toBe(city)
  })
})

// ── assignSpecialist ──────────────────────────────────────────────────────────

describe('assignSpecialist', () => {
  it('converts a Scientist to Merchant when Market slot is available', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Scientist }],
    })
    // Market unlocks 1 Merchant slot
    const buildings = [getBuildingDef(B_FORGE)]  // Forge: 1 Engineer slot
    const next = assignSpecialist(city, SpecialistType.Engineer, buildings)
    expect(next.citizenAssignments[0]).toEqual({
      kind:           'specialist',
      specialistType: SpecialistType.Engineer,
    })
  })

  it('rejects assignment when no slot is available', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Scientist }],
    })
    // No Library → Scientist slots = 0
    const next = assignSpecialist(city, SpecialistType.Scientist, [])
    expect(next).toBe(city)
  })

  it('respects the slot cap from buildings', () => {
    // Library allows 2 Scientists; try to assign a 3rd
    const city = makeCity({
      population: 3,
      citizenAssignments: [
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
        { kind: 'specialist', specialistType: SpecialistType.Merchant },
      ],
    })
    const buildings = [getBuildingDef(B_LIBRARY)]  // 2 Scientist slots
    const next = assignSpecialist(city, SpecialistType.Scientist, buildings)
    // Already 2 Scientists and cap is 2 → should not change
    expect(next).toBe(city)
  })
})

// ── unassignSpecialist ────────────────────────────────────────────────────────

describe('unassignSpecialist', () => {
  it('converts a target specialist back to Scientist', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Merchant }],
    })
    const next = unassignSpecialist(city, SpecialistType.Merchant)
    expect(next.citizenAssignments[0]).toEqual({
      kind:           'specialist',
      specialistType: SpecialistType.Scientist,
    })
  })

  it('returns city unchanged if no specialist of that type exists', () => {
    const city = makeCity()  // has 1 Scientist
    const next = unassignSpecialist(city, SpecialistType.Merchant)
    expect(next).toBe(city)
  })
})

// ── autoAssignCitizens ────────────────────────────────────────────────────────

describe('autoAssignCitizens', () => {
  it('assigns citizens to the highest-food tiles first', () => {
    const city = makeCity({ population: 2 })
    const tiles = [
      workedTile(1, { food: 4, production: 0, commerce: 0 }),
      workedTile(2, { food: 1, production: 0, commerce: 0 }),
      workedTile(3, { food: 2, production: 0, commerce: 0 }),
    ]
    const next = autoAssignCitizens(city, tiles)
    const keys = next.citizenAssignments.map(a => a.kind === 'tile' ? a.tileKey : null)
    expect(keys).toContain(1)  // tileKey 1 has most food
    expect(keys).toContain(3)  // tileKey 3 has second-most food
    expect(keys).not.toContain(2)
  })

  it('uses production as tiebreaker when food is equal', () => {
    const city = makeCity({ population: 1 })
    const tiles = [
      workedTile(10, { food: 2, production: 1, commerce: 0 }),
      workedTile(20, { food: 2, production: 3, commerce: 0 }),
    ]
    const next = autoAssignCitizens(city, tiles)
    expect(next.citizenAssignments[0]).toEqual({ kind: 'tile', tileKey: 20 })
  })

  it('overflows extra citizens to Scientist specialists', () => {
    const city = makeCity({ population: 3 })
    const tiles = [workedTile(1, GRASS_YIELD)]  // only 1 tile for 3 citizens
    const next = autoAssignCitizens(city, tiles)
    const tileCount       = next.citizenAssignments.filter(a => a.kind === 'tile').length
    const specialistCount = next.citizenAssignments.filter(a => a.kind === 'specialist').length
    expect(tileCount).toBe(1)
    expect(specialistCount).toBe(2)
  })

  it('assigns all citizens as specialists when no tiles are available', () => {
    const city = makeCity({ population: 2 })
    const next = autoAssignCitizens(city, [])
    expect(next.citizenAssignments.every(a => a.kind === 'specialist')).toBe(true)
  })

  it('produces length === population assignments', () => {
    const city  = makeCity({ population: 4 })
    const tiles = [1, 2, 3, 4, 5].map(k => workedTile(k, GRASS_YIELD))
    const next  = autoAssignCitizens(city, tiles)
    expect(next.citizenAssignments).toHaveLength(4)
  })

  it('returns city unchanged when population is 0', () => {
    const city = makeCity({
      population: 0,
      citizenAssignments: [],
    })
    expect(autoAssignCitizens(city, [])).toBe(city)
  })

  it('does not mutate the original city', () => {
    const city = makeCity({ population: 1 })
    const orig = city.citizenAssignments[0]
    autoAssignCitizens(city, [workedTile(99, GRASS_YIELD)])
    expect(city.citizenAssignments[0]).toBe(orig)
  })
})
