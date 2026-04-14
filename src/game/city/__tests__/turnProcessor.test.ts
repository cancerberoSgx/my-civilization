import { describe, it, expect } from 'vitest'
import { processCityTurn } from '../turnProcessor'
import { SpecialistType } from '../types'
import type { CityTurnContext, ProductionQueueItem } from '../types'
import { B_GRANARY, B_LIBRARY, getBuildingDef } from '../definitions'
import { UnitTypeId } from '../../../shared/types'
import { makeCity, RATES, ZERO_YIELD, GRASS_YIELD, workedTile } from './helpers'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<CityTurnContext> = {}): CityTurnContext {
  return {
    centerTileYields: ZERO_YIELD,
    workedTiles:      [],
    buildings:        [],
    commerceRates:    RATES,
    turn:             1,
    ...overrides,
  }
}

// ── Production queue ──────────────────────────────────────────────────────────

describe('processCityTurn — production', () => {
  it('accumulates hammers toward the current item each turn', () => {
    const item: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 0,
    }
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 1 }],
      productionQueue: [item],
    })
    const ctx = makeContext({
      workedTiles: [workedTile(1, { food: 2, production: 4, commerce: 0 })],
    })
    const next = processCityTurn(city, ctx)
    expect(next.productionQueue[0]?.accumulatedHammers).toBe(4)
  })

  it('removes a unit from the queue when its cost is met', () => {
    // Warrior costs 10 hammers; start with 7 and add 4 → 11 ≥ 10 → complete
    const item: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 7,
    }
    const city = makeCity({
      productionQueue: [item],
      citizenAssignments: [{ kind: 'tile', tileKey: 1 }],
    })
    const ctx = makeContext({
      workedTiles: [workedTile(1, { food: 2, production: 4, commerce: 0 })],
    })
    const next = processCityTurn(city, ctx)
    expect(next.productionQueue).toHaveLength(0)
  })

  it('advances to the next queue item automatically after completion', () => {
    const warrior: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 9,
    }
    const archer: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Archer, accumulatedHammers: 0,
    }
    const city = makeCity({
      productionQueue: [warrior, archer],
      citizenAssignments: [{ kind: 'tile', tileKey: 1 }],
    })
    const ctx = makeContext({
      workedTiles: [workedTile(1, { food: 2, production: 5, commerce: 0 })],
    })
    const next = processCityTurn(city, ctx)
    // Warrior (10 cost) completed; Archer remains
    expect(next.productionQueue).toHaveLength(1)
    expect(next.productionQueue[0]!.kind).toBe('unit')
    expect((next.productionQueue[0] as Extract<ProductionQueueItem, { kind: 'unit' }>).unitTypeId)
      .toBe(UnitTypeId.Archer)
  })

  it('adds a completed building to builtBuildings', () => {
    const item: ProductionQueueItem = {
      kind: 'building', buildingId: B_GRANARY, accumulatedHammers: 59,
    }
    const city = makeCity({
      productionQueue: [item],
      citizenAssignments: [{ kind: 'tile', tileKey: 1 }],
    })
    const ctx = makeContext({
      workedTiles: [workedTile(1, { food: 0, production: 5, commerce: 0 })],
    })
    const next = processCityTurn(city, ctx)
    expect(next.builtBuildings).toContain(B_GRANARY)
    expect(next.productionQueue).toHaveLength(0)
  })

  it('does not advance the queue when there are no hammers', () => {
    const item: ProductionQueueItem = {
      kind: 'unit', unitTypeId: UnitTypeId.Warrior, accumulatedHammers: 5,
    }
    const city = makeCity({ productionQueue: [item] })
    const ctx  = makeContext()  // 0 production
    const next = processCityTurn(city, ctx)
    expect(next.productionQueue[0]?.accumulatedHammers).toBe(5)
  })
})

// ── Food and population growth ────────────────────────────────────────────────

describe('processCityTurn — food and growth', () => {
  it('accumulates food each turn', () => {
    // population=1: needs 2 food/turn consumed, center provides 3 → net +1
    const city = makeCity({ population: 1, storedFood: 0 })
    const ctx  = makeContext({ centerTileYields: { food: 3, production: 0, commerce: 0 } })
    const next = processCityTurn(city, ctx)
    expect(next.storedFood).toBe(1)  // net = 3 - 2*1 = 1
  })

  it('triggers population growth when food box is full', () => {
    // threshold for pop=1: 20 + 10*1 = 30
    // storedFood=29, net = 3 - 2 = 1 → nextFood = 30 ≥ 30 → grow
    const city = makeCity({ population: 1, storedFood: 29 })
    const ctx  = makeContext({ centerTileYields: { food: 3, production: 0, commerce: 0 } })
    const next = processCityTurn(city, ctx)
    expect(next.population).toBe(2)
    expect(next.storedFood).toBe(0)  // no Granary
    expect(next.citizenAssignments).toHaveLength(2)
  })

  it('Granary carries over 50% of the food threshold on growth', () => {
    // threshold = 30; 50% = 15
    const city = makeCity({ population: 1, storedFood: 29 })
    const ctx  = makeContext({
      centerTileYields: { food: 3, production: 0, commerce: 0 },
      buildings: [getBuildingDef(B_GRANARY)],
    })
    const next = processCityTurn(city, ctx)
    expect(next.population).toBe(2)
    expect(next.storedFood).toBe(15)
  })

  it('triggers starvation when food box empties with negative net food', () => {
    // population=2, food consumed=4, yield=0 → net=-4, storedFood=2 → nextFood=-2 < 0 → starve
    const city = makeCity({
      population: 2,
      storedFood: 2,
      citizenAssignments: [
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
      ],
    })
    const ctx  = makeContext({ centerTileYields: ZERO_YIELD })
    const next = processCityTurn(city, ctx)
    expect(next.population).toBe(1)
    expect(next.storedFood).toBe(0)
    expect(next.citizenAssignments).toHaveLength(1)
  })

  it('population cannot starve below 1', () => {
    const city = makeCity({ population: 1, storedFood: 0 })
    const ctx  = makeContext({ centerTileYields: ZERO_YIELD })  // 0 food, consumes 2
    const next = processCityTurn(city, ctx)
    expect(next.population).toBe(1)
    expect(next.storedFood).toBe(0)
  })

  it('does not grow when food box is just below the threshold', () => {
    // threshold=30, storedFood=28, net=1 → nextFood=29 < 30
    const city = makeCity({ population: 1, storedFood: 28 })
    const ctx  = makeContext({ centerTileYields: { food: 3, production: 0, commerce: 0 } })
    const next = processCityTurn(city, ctx)
    expect(next.population).toBe(1)
    expect(next.storedFood).toBe(29)
  })
})

// ── Great Person pool ─────────────────────────────────────────────────────────

describe('processCityTurn — Great Person pool', () => {
  it('accumulates GPP from specialists each turn', () => {
    // 1 Scientist → 2 GPP/turn
    const city = makeCity({ population: 1 })  // default: 1 Scientist
    const ctx  = makeContext()
    const next = processCityTurn(city, ctx)
    expect(next.greatPersonPool.points).toBe(2)
  })

  it('triggers a Great Person birth at threshold 100', () => {
    const city = makeCity({
      population: 1,
      greatPersonPool: { points: 98, greatPeopleBorn: 0, sources: {} },
    })
    const ctx = makeContext()  // 1 Scientist → +2 GPP → total 100 ≥ 100
    const next = processCityTurn(city, ctx)
    expect(next.greatPersonPool.greatPeopleBorn).toBe(1)
    expect(next.greatPersonPool.points).toBeLessThan(100)
    expect(next.greatPersonPool.sources).toEqual({})
  })

  it('subsequent threshold doubles to 200', () => {
    const city = makeCity({
      population: 1,
      greatPersonPool: { points: 199, greatPeopleBorn: 1, sources: {} },
    })
    const ctx  = makeContext()  // +2 GPP → 201 ≥ 200 → birth
    const next = processCityTurn(city, ctx)
    expect(next.greatPersonPool.greatPeopleBorn).toBe(2)
  })

  it('carries over excess GPP after a birth', () => {
    const city = makeCity({
      population: 1,
      greatPersonPool: { points: 99, greatPeopleBorn: 0, sources: {} },
    })
    const ctx  = makeContext()  // +2 GPP → 101 → birth, carry 1
    const next = processCityTurn(city, ctx)
    expect(next.greatPersonPool.points).toBe(1)
  })
})

// ── Culture accumulation ──────────────────────────────────────────────────────

describe('processCityTurn — culture', () => {
  it('accumulates culture each turn', () => {
    const city = makeCity({ storedCulture: 10 })
    // 10 commerce at 50% sci, 30% gold, 20% culture → 2 culture
    const ctx  = makeContext({ centerTileYields: { food: 0, production: 0, commerce: 10 } })
    const next = processCityTurn(city, ctx)
    expect(next.storedCulture).toBeGreaterThan(10)
  })

  it('Library does not affect culture directly', () => {
    const city = makeCity({ storedCulture: 0 })
    const ctx  = makeContext({
      centerTileYields: { food: 0, production: 0, commerce: 10 },
      buildings: [getBuildingDef(B_LIBRARY)],
    })
    const next = processCityTurn(city, ctx)
    // Library adds +25% science, not culture — culture should be same as without Library
    expect(next.storedCulture).toBe(2)  // 20% of 10 commerce
  })
})
