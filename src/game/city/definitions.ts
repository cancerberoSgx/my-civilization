import { UnitTypeId } from '../../shared/types'
import { SpecialistType } from './types'
import type { BuildingDefinition, BuildingId, UnitDefinition } from './types'

// ── Building ID constants ─────────────────────────────────────────────────────

export const B_GRANARY    = 'granary'    as BuildingId
export const B_LIBRARY    = 'library'    as BuildingId
export const B_BARRACKS   = 'barracks'   as BuildingId
export const B_MARKET     = 'market'     as BuildingId
export const B_FORGE      = 'forge'      as BuildingId
export const B_AQUEDUCT   = 'aqueduct'   as BuildingId
export const B_COURTHOUSE = 'courthouse' as BuildingId
export const B_COLOSSEUM  = 'colosseum'  as BuildingId

// ── Building registry ─────────────────────────────────────────────────────────

const BUILDING_DEFS: readonly BuildingDefinition[] = [
  {
    id:           B_GRANARY,
    name:         'Granary',
    cost:         60,
    maintenance:  1,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: {},
    specialistSlots: [],
    happinessBonus: 0,
    healthBonus:    2,
    defenseBonus:   0,
    granaryEffect:    true,
    barracksEffect:   false,
    courthouseEffect: false,
  },
  {
    id:           B_LIBRARY,
    name:         'Library',
    cost:         90,
    maintenance:  1,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: { science: 25 },
    specialistSlots: [{ type: SpecialistType.Scientist, count: 2 }],
    happinessBonus: 0,
    healthBonus:    0,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: false,
  },
  {
    id:           B_BARRACKS,
    name:         'Barracks',
    cost:         60,
    maintenance:  1,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: {},
    specialistSlots: [],
    happinessBonus: 0,
    healthBonus:    0,
    defenseBonus:   25,
    granaryEffect:    false,
    barracksEffect:   true,
    courthouseEffect: false,
  },
  {
    id:           B_MARKET,
    name:         'Market',
    cost:         120,
    maintenance:  1,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: { gold: 25 },
    specialistSlots: [{ type: SpecialistType.Merchant, count: 1 }],
    happinessBonus: 1,
    healthBonus:    0,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: false,
  },
  {
    id:           B_FORGE,
    name:         'Forge',
    cost:         150,
    maintenance:  2,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: { production: 25 },
    specialistSlots: [{ type: SpecialistType.Engineer, count: 1 }],
    happinessBonus: 0,
    healthBonus:    0,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: false,
  },
  {
    id:           B_AQUEDUCT,
    name:         'Aqueduct',
    cost:         100,
    maintenance:  2,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: {},
    specialistSlots: [],
    happinessBonus: 0,
    healthBonus:    4,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: false,
  },
  {
    id:           B_COURTHOUSE,
    name:         'Courthouse',
    cost:         80,
    maintenance:  1,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: {},
    specialistSlots: [],
    happinessBonus: 0,
    healthBonus:    0,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: true,
  },
  {
    id:           B_COLOSSEUM,
    name:         'Colosseum',
    cost:         120,
    maintenance:  2,
    prerequisites: { buildings: [] },
    flatYields:   {},
    percentYields: { culture: 25 },
    specialistSlots: [{ type: SpecialistType.Artist, count: 1 }],
    happinessBonus: 3,
    healthBonus:    0,
    defenseBonus:   0,
    granaryEffect:    false,
    barracksEffect:   false,
    courthouseEffect: false,
  },
]

/** Registry of all building definitions keyed by BuildingId. */
export const BUILDING_MAP: ReadonlyMap<BuildingId, BuildingDefinition> = new Map(
  BUILDING_DEFS.map(b => [b.id, b] as const),
)

/**
 * Returns the definition for a building type.
 * @throws {Error} if `id` is not a recognised building ID
 */
export function getBuildingDef(id: BuildingId): BuildingDefinition {
  const def = BUILDING_MAP.get(id)
  if (def === undefined) throw new Error(`Unknown building ID: "${id}"`)
  return def
}

// ── Unit registry ─────────────────────────────────────────────────────────────

const UNIT_DEFS: readonly UnitDefinition[] = [
  {
    typeId:        UnitTypeId.Warrior,
    name:          'Warrior',
    cost:          10,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Archer,
    name:          'Archer',
    cost:          25,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Spearman,
    name:          'Spearman',
    cost:          30,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Swordsman,
    name:          'Swordsman',
    cost:          40,
    prerequisites: { buildings: [B_BARRACKS] },
  },
  {
    typeId:        UnitTypeId.Knight,
    name:          'Knight',
    cost:          80,
    prerequisites: { buildings: [B_BARRACKS] },
  },
  {
    typeId:        UnitTypeId.Catapult,
    name:          'Catapult',
    cost:          70,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Scout,
    name:          'Scout',
    cost:          20,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Settler,
    name:          'Settler',
    cost:          100,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Worker,
    name:          'Worker',
    cost:          60,
    prerequisites: { buildings: [] },
  },
  {
    typeId:        UnitTypeId.Galley,
    name:          'Galley',
    cost:          60,
    prerequisites: { buildings: [] },
  },
]

/** Registry of all producible unit definitions keyed by UnitTypeId. */
export const UNIT_DEF_MAP: ReadonlyMap<UnitTypeId, UnitDefinition> = new Map(
  UNIT_DEFS.map(u => [u.typeId, u] as const),
)

/**
 * Returns the production definition for a unit type.
 * @throws {Error} if `typeId` is not in the production registry (e.g. City)
 */
export function getUnitDef(typeId: UnitTypeId): UnitDefinition {
  const def = UNIT_DEF_MAP.get(typeId)
  if (def === undefined) throw new Error(`Unit type ID ${typeId} is not producible`)
  return def
}
