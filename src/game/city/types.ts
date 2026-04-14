import type { UnitTypeId } from '../../shared/types'

// ── Branded ID types ──────────────────────────────────────────────────────────

/** Helper for creating branded nominal types. */
type Brand<T, B extends string> = T & { readonly __brand: B }

/** Unique identifier for a city instance. */
export type CityId = Brand<string, 'CityId'>

/** Identifier for a building type (matches BuildingDefinition.id). */
export type BuildingId = Brand<string, 'BuildingId'>

// ── Yield types ───────────────────────────────────────────────────────────────

/** Raw per-tile or per-specialist output before any building modifiers. */
export interface TileYield {
  readonly food:       number
  readonly production: number
  readonly commerce:   number
}

/**
 * Full city output per turn, after all modifiers and commerce splitting.
 * `commerce` is kept as the raw total before splitting; science/gold/culture
 * are the derived values after applying the player's slider rates.
 */
export interface CityOutput {
  readonly food:       number
  readonly production: number
  readonly commerce:   number
  readonly science:    number
  readonly gold:       number
  readonly culture:    number
  readonly gpp:        number
}

// ── Specialists ───────────────────────────────────────────────────────────────

/** Types of specialist citizens a city can employ. */
export enum SpecialistType {
  Scientist = 'scientist',
  Merchant  = 'merchant',
  Engineer  = 'engineer',
  Artist    = 'artist',
  Priest    = 'priest',
}

/** A specialist slot that a building unlocks, allowing citizens of that type. */
export interface SpecialistSlot {
  readonly type:  SpecialistType
  /** Maximum number of this specialist type unlocked by the building. */
  readonly count: number
}

// ── Citizen assignment ────────────────────────────────────────────────────────

/**
 * Describes what a single city citizen is doing each turn.
 *  - `tile`: the citizen works a specific map tile (tileKey = y * mapWidth + x)
 *  - `specialist`: the citizen works as a specialist of the given type
 */
export type CitizenAssignment =
  | { readonly kind: 'tile';       readonly tileKey:       number        }
  | { readonly kind: 'specialist'; readonly specialistType: SpecialistType }

// ── Tile reference for yield calculations ────────────────────────────────────

/**
 * A map tile with its precomputed base yields.
 * Callers must derive these from terrain + feature + resource + improvement
 * before passing them into city calculators.
 */
export interface WorkedTile {
  /** y * mapWidth + x */
  readonly tileKey: number
  readonly yields:  TileYield
}

// ── Production queue ──────────────────────────────────────────────────────────

/**
 * One item in a city's production queue.
 * `accumulatedHammers` tracks how many production points have been invested
 * in this item so far.
 */
export type ProductionQueueItem =
  | {
      readonly kind:               'building'
      readonly buildingId:         BuildingId
      readonly accumulatedHammers: number
    }
  | {
      readonly kind:               'unit'
      readonly unitTypeId:         UnitTypeId
      readonly accumulatedHammers: number
    }

// ── Building definition ───────────────────────────────────────────────────────

/**
 * Static definition of a building type.
 * Instances are stored in the registry in definitions.ts.
 */
export interface BuildingDefinition {
  readonly id:          BuildingId
  readonly name:        string
  /** Hammer cost to construct. */
  readonly cost:        number
  /** Gold per turn maintenance cost. */
  readonly maintenance: number
  readonly prerequisites: {
    /** Other buildings that must already be built first. */
    readonly buildings: readonly BuildingId[]
  }
  /**
   * Flat yield bonuses added to city output each turn.
   * Keys are a subset of CityOutput fields.
   */
  readonly flatYields: Partial<Record<keyof CityOutput, number>>
  /**
   * Percentage yield bonuses (0–100) applied multiplicatively after flat
   * bonuses. E.g. `{ science: 25 }` means +25 % to science output.
   */
  readonly percentYields: Partial<Record<'food' | 'production' | 'science' | 'gold' | 'culture', number>>
  /** Specialist slots this building unlocks. */
  readonly specialistSlots: readonly SpecialistSlot[]
  readonly happinessBonus: number
  readonly healthBonus:    number
  /** Percentage combat-strength defense bonus for the city tile. */
  readonly defenseBonus:   number
  /** Granary effect: carry over 50 % of the food box on population growth. */
  readonly granaryEffect:    boolean
  /** Barracks effect: units built here gain starting XP. */
  readonly barracksEffect:   boolean
  /** Courthouse effect: reduce city maintenance cost by 50 %. */
  readonly courthouseEffect: boolean
}

// ── Unit definition ───────────────────────────────────────────────────────────

/** Static definition of a unit that can be queued for production in a city. */
export interface UnitDefinition {
  readonly typeId: UnitTypeId
  readonly name:   string
  /** Hammer cost to build. */
  readonly cost:   number
  readonly prerequisites: {
    /** Buildings required before this unit can be queued. */
    readonly buildings: readonly BuildingId[]
  }
}

// ── Great People ──────────────────────────────────────────────────────────────

/**
 * Accumulator tracking progress toward the next Great Person birth.
 *
 * `sources` records how many GPP have been contributed by each specialist type
 * across all turns since the last Great Person was born. The type with the
 * highest accumulated contribution determines the next GP's flavor.
 */
export interface GreatPersonPool {
  /** Current accumulated GPP points in the pool. */
  readonly points:          number
  /** Total great people born from this city (determines the next threshold). */
  readonly greatPeopleBorn: number
  /** Per-specialist-type GPP accumulated since the last Great Person birth. */
  readonly sources: Readonly<Partial<Record<SpecialistType, number>>>
}

// ── Commerce rates ────────────────────────────────────────────────────────────

/**
 * Player-level commerce split rates (percentages, must sum to 100).
 * Applied each turn to convert raw commerce into science, gold, and culture.
 */
export interface CommerceRates {
  readonly scienceRate: number
  readonly goldRate:    number
  readonly cultureRate: number
}

// ── City ──────────────────────────────────────────────────────────────────────

/**
 * Full immutable city state.
 * All updates are performed by returning a new object (no mutation).
 */
export interface City {
  readonly id:          CityId
  readonly name:        string
  /** Player ID of the owning civilization (1-based). */
  readonly ownerId:     number
  readonly foundedTurn: number
  /** Map tile column of the city center. */
  readonly x: number
  /** Map tile row of the city center. */
  readonly y: number

  /** Number of citizens (≥ 1). */
  readonly population: number
  /** Food accumulated in the growth box this turn cycle. */
  readonly storedFood: number

  /**
   * One entry per citizen (length === population).
   * The city center tile is always worked for free and is NOT listed here.
   * Each citizen either works a tile or acts as a specialist.
   */
  readonly citizenAssignments: readonly CitizenAssignment[]

  /** Ordered production queue; the first item is currently being worked. */
  readonly productionQueue: readonly ProductionQueueItem[]

  /** IDs of buildings already constructed in this city. */
  readonly builtBuildings: readonly BuildingId[]

  readonly greatPersonPool: GreatPersonPool

  /** Current health value (contributes to the max-effective-population cap). */
  readonly health:    number
  /** Current happiness value (affects how many citizens work productively). */
  readonly happiness: number

  /** Accumulated culture for border expansion. */
  readonly storedCulture: number
  /**
   * Tile keys (y * mapWidth + x) within this city's cultural borders,
   * excluding the city center tile itself.
   */
  readonly cultureBorderTiles: readonly number[]
}

// ── Turn context ──────────────────────────────────────────────────────────────

/**
 * External state snapshot required to process one city's turn.
 * All tile yields must be precomputed by the caller before invoking
 * processCityTurn — the turn processor itself is pure.
 */
export interface CityTurnContext {
  /** Yields of the city center tile (always worked for free). */
  readonly centerTileYields: TileYield
  /** Yields for every tile currently worked by a citizen (excluding center). */
  readonly workedTiles: readonly WorkedTile[]
  /** Definitions of all buildings currently built in the city. */
  readonly buildings: readonly BuildingDefinition[]
  /** Player-level science / gold / culture split (must sum to 100). */
  readonly commerceRates: CommerceRates
  /** Current game turn number. */
  readonly turn: number
}
