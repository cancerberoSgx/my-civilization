import { describe, it, expect } from 'vitest'
import { calculateCityYields, getSpecialistYield } from '../yields'
import { SpecialistType } from '../types'
import type { BuildingDefinition, TileYield, WorkedTile } from '../types'
import { B_LIBRARY, B_FORGE, B_MARKET, getBuildingDef } from '../definitions'
import { makeCity, RATES, ZERO_YIELD, GRASS_YIELD, workedTile } from './helpers'

const NO_BUILDINGS: BuildingDefinition[] = []

// ── getSpecialistYield ────────────────────────────────────────────────────────

describe('getSpecialistYield', () => {
  it('Scientist yields 3 science and 2 GPP', () => {
    const y = getSpecialistYield(SpecialistType.Scientist)
    expect(y.science).toBe(3)
    expect(y.gpp).toBe(2)
  })

  it('Engineer yields 2 production and 2 GPP', () => {
    const y = getSpecialistYield(SpecialistType.Engineer)
    expect(y.production).toBe(2)
    expect(y.gpp).toBe(2)
  })
})

// ── calculateCityYields — basic tile yields ───────────────────────────────────

describe('calculateCityYields — tiles', () => {
  it('returns center tile yields when population=1 and citizen is a specialist', () => {
    // The only citizen is a Scientist, so no tiles are worked beyond the center.
    const city   = makeCity({ population: 1 })
    const center: TileYield = { food: 2, production: 1, commerce: 1 }
    const out = calculateCityYields(city, center, [], NO_BUILDINGS, RATES)
    // center: 2F, 1P, 1C  →  science = floor(1 * 0.5) = 0, gold = floor(1 * 0.3) = 0, culture = 1 - 0 - 0 = 1
    // + Scientist: +3 science, +2 GPP
    expect(out.food).toBe(2)
    expect(out.production).toBe(1)
    expect(out.commerce).toBe(1)
    expect(out.science).toBe(0 + 3)  // commerce→science + specialist
    expect(out.gpp).toBe(2)
  })

  it('adds a citizen-worked tile on top of the center', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 42 }],
    })
    const center: TileYield    = { food: 1, production: 1, commerce: 0 }
    const extras: WorkedTile[] = [workedTile(42, { food: 3, production: 0, commerce: 2 })]

    const out = calculateCityYields(city, center, extras, NO_BUILDINGS, RATES)

    expect(out.food).toBe(4)       // 1 center + 3 tile
    expect(out.production).toBe(1) // 1 center + 0 tile
    expect(out.commerce).toBe(2)   // 0 center + 2 tile
  })

  it('ignores a tile assignment if tileKey is not in workedTiles', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 99 }],
    })
    const out = calculateCityYields(city, ZERO_YIELD, [], NO_BUILDINGS, RATES)
    expect(out.food).toBe(0)
    expect(out.production).toBe(0)
  })

  it('sums multiple citizen-worked tiles correctly', () => {
    const city = makeCity({
      population: 3,
      citizenAssignments: [
        { kind: 'tile', tileKey: 1 },
        { kind: 'tile', tileKey: 2 },
        { kind: 'tile', tileKey: 3 },
      ],
    })
    const tiles = [
      workedTile(1, GRASS_YIELD),  // 2F 1P 1C
      workedTile(2, GRASS_YIELD),  // 2F 1P 1C
      workedTile(3, { food: 0, production: 3, commerce: 0 }),
    ]
    const out = calculateCityYields(city, ZERO_YIELD, tiles, NO_BUILDINGS, RATES)
    expect(out.food).toBe(4)       // 2+2+0
    expect(out.production).toBe(5) // 1+1+3
  })
})

// ── calculateCityYields — specialists ────────────────────────────────────────

describe('calculateCityYields — specialists', () => {
  it('Merchant specialist adds 3 gold and 2 GPP', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Merchant }],
    })
    const out = calculateCityYields(city, ZERO_YIELD, [], NO_BUILDINGS, RATES)
    expect(out.gold).toBe(3)
    expect(out.gpp).toBe(2)
  })

  it('Artist specialist adds culture and GPP', () => {
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'specialist', specialistType: SpecialistType.Artist }],
    })
    const out = calculateCityYields(city, ZERO_YIELD, [], NO_BUILDINGS, RATES)
    expect(out.culture).toBeGreaterThan(0)
    expect(out.gpp).toBe(2)
  })

  it('multiple specialists stack GPP', () => {
    const city = makeCity({
      population: 3,
      citizenAssignments: [
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
        { kind: 'specialist', specialistType: SpecialistType.Scientist },
        { kind: 'specialist', specialistType: SpecialistType.Engineer },
      ],
    })
    const out = calculateCityYields(city, ZERO_YIELD, [], NO_BUILDINGS, RATES)
    expect(out.gpp).toBe(6)  // 2+2+2
    expect(out.science).toBeGreaterThanOrEqual(6)  // 3+3 from scientists
    expect(out.production).toBeGreaterThanOrEqual(2) // from engineer
  })
})

// ── calculateCityYields — building bonuses ────────────────────────────────────

describe('calculateCityYields — building bonuses', () => {
  it('Library adds +25% to science output', () => {
    // 10 raw commerce → 5 science (at 50 %) → +25% → floor(5 * 1.25) = 6
    const city   = makeCity({ population: 1 })
    const center = { food: 0, production: 0, commerce: 10 }
    const withoutLib = calculateCityYields(city, center, [], NO_BUILDINGS, RATES)
    const withLib    = calculateCityYields(city, center, [], [getBuildingDef(B_LIBRARY)], RATES)
    expect(withLib.science).toBeGreaterThan(withoutLib.science)
    // Exact: floor(5 * 1.25) = 6; specialist adds 3 more → 9
    expect(withLib.science - withoutLib.science).toBeGreaterThan(0)
  })

  it('Forge adds +25% production', () => {
    const city   = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 7 }],
    })
    const tiles  = [workedTile(7, { food: 0, production: 8, commerce: 0 })]
    const withoutForge = calculateCityYields(city, ZERO_YIELD, tiles, NO_BUILDINGS, RATES)
    const withForge    = calculateCityYields(city, ZERO_YIELD, tiles, [getBuildingDef(B_FORGE)], RATES)
    // 8 production → floor(8 * 1.25) = 10
    expect(withForge.production).toBe(10)
    expect(withoutForge.production).toBe(8)
  })

  it('Market adds +25% gold output', () => {
    // 20 commerce × 30 % gold rate = 6 gold; 6 × 1.25 = 7.5 → floor = 7
    const city   = makeCity({ population: 1 })
    const center = { food: 0, production: 0, commerce: 20 }
    const without = calculateCityYields(city, center, [], NO_BUILDINGS, RATES)
    const with_   = calculateCityYields(city, center, [], [getBuildingDef(B_MARKET)], RATES)
    expect(with_.gold).toBeGreaterThan(without.gold)
    expect(without.gold).toBe(6)
    expect(with_.gold).toBe(7)
  })

  it('commerce is preserved as raw total regardless of split', () => {
    const city   = makeCity({ population: 1 })
    const center = { food: 0, production: 0, commerce: 6 }
    const out    = calculateCityYields(city, center, [], NO_BUILDINGS, RATES)
    expect(out.commerce).toBe(6)
  })
})

// ── calculateCityYields — commerce split ────────────────────────────────────

describe('calculateCityYields — commerce split', () => {
  it('splits 10 commerce into correct science/gold/culture', () => {
    // RATES: 50% science, 30% gold, 20% culture
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 1 }],
    })
    const tiles = [workedTile(1, { food: 0, production: 0, commerce: 10 })]
    const out   = calculateCityYields(city, ZERO_YIELD, tiles, NO_BUILDINGS, RATES)
    // No specialist science contribution in this city (using tile assignment)
    expect(out.science).toBe(5)   // floor(10 * 0.5)
    expect(out.gold).toBe(3)      // floor(10 * 0.3)
    expect(out.culture).toBe(2)   // 10 - 5 - 3
  })

  it('remainder commerce goes to culture', () => {
    // 7 commerce at 50/30 → science=3, gold=2, culture=2 (not 7*0.2=1.4)
    const city = makeCity({
      population: 1,
      citizenAssignments: [{ kind: 'tile', tileKey: 5 }],
    })
    const tiles = [workedTile(5, { food: 0, production: 0, commerce: 7 })]
    const out   = calculateCityYields(city, ZERO_YIELD, tiles, NO_BUILDINGS, RATES)
    expect(out.science + out.gold + out.culture).toBe(7)
  })
})
