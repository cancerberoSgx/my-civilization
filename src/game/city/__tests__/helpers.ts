import { SpecialistType } from '../types'
import type { City, CityId, CommerceRates, TileYield, WorkedTile } from '../types'

/** Creates a minimal valid City for use in tests. */
export function makeCity(overrides: Partial<City> = {}): City {
  const population = overrides.population ?? 1
  // Compute citizenAssignments once (respects overrides.citizenAssignments if provided).
  const citizenAssignments = overrides.citizenAssignments ??
    Array.from({ length: population }, () => ({
      kind:           'specialist' as const,
      specialistType: SpecialistType.Scientist,
    }))

  // citizenAssignments appears only once as an explicit key (at the end) so
  // that esbuild does not warn about a duplicate key in the object literal.
  return {
    id:                 'city-test' as CityId,
    name:               'Testburg',
    ownerId:            1,
    foundedTurn:        0,
    x:                  5,
    y:                  5,
    population,
    storedFood:         0,
    productionQueue:    [],
    builtBuildings:     [],
    greatPersonPool:    { points: 0, greatPeopleBorn: 0, sources: {} },
    health:             5,
    happiness:          5,
    storedCulture:      0,
    cultureBorderTiles: [],
    ...overrides,
    citizenAssignments,
  }
}

/** 50 % science, 30 % gold, 20 % culture. */
export const RATES: CommerceRates = { scienceRate: 50, goldRate: 30, cultureRate: 20 }

/** Neutral tile that contributes nothing — useful as a center tile placeholder. */
export const ZERO_YIELD: TileYield = { food: 0, production: 0, commerce: 0 }

/** A grassland-like tile (2 food, 1 production, 1 commerce). */
export const GRASS_YIELD: TileYield = { food: 2, production: 1, commerce: 1 }

/** Helper to build a WorkedTile. */
export function workedTile(tileKey: number, yields: TileYield): WorkedTile {
  return { tileKey, yields }
}
