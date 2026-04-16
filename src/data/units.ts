import { UnitTypeId, UnitCategory, TerrainType, ActionId, FeatureType, type UnitDef } from '../shared/types'

export const UNIT_DEFS: UnitDef[] = [
  {
    id: UnitTypeId.Warrior, name: 'Warrior', letter: 'W', strength: 2, movement: 1, isNaval: false,
    sprite: 'warrior', category: UnitCategory.Melee,
    combatBonuses: [
      { vsCity: true, pct: 25, onlyWhenDefending: true },  // +25% city defense
    ],
  },
  {
    id: UnitTypeId.Archer, name: 'Archer', letter: 'A', strength: 3, movement: 1, isNaval: false,
    sprite: 'archer', category: UnitCategory.Archery,
    combatBonuses: [
      { vsTerrain: TerrainType.Hill, pct: 25, onlyWhenDefending: true },  // +25% hills defense
    ],
  },
  {
    id: UnitTypeId.Settler, name: 'Settler', letter: 'S', strength: 0, movement: 2, isNaval: false,
    sprite: 'settler', actions: [ActionId.FoundCity],
    category: UnitCategory.NonCombat, cannotAttack: true,
  },
  {
    id: UnitTypeId.Worker, name: 'Worker', letter: 'K', strength: 0, movement: 2, isNaval: false,
    sprite: 'worker',
    category: UnitCategory.NonCombat, cannotAttack: true,
  },
  {
    id: UnitTypeId.Spearman, name: 'Spearman', letter: 'P', strength: 4, movement: 1, isNaval: false,
    sprite: 'spearman', category: UnitCategory.Melee,
    combatBonuses: [
      { vsCategory: UnitCategory.Mounted, pct: 100 },  // +100% vs Mounted
    ],
  },
  {
    id: UnitTypeId.Swordsman, name: 'Swordsman', letter: 'X', strength: 6, movement: 1, isNaval: false,
    sprite: 'swordsman', category: UnitCategory.Melee,
    combatBonuses: [
      { vsCity: true, pct: 10, onlyWhenAttacking: true },  // +10% city attack
    ],
  },
  {
    id: UnitTypeId.Knight, name: 'Knight', letter: 'N', strength: 10, movement: 2, isNaval: false,
    category: UnitCategory.Mounted, noTerrainBonus: true,
  },
  {
    id: UnitTypeId.Catapult, name: 'Catapult', letter: 'C', strength: 5, movement: 1, isNaval: false,
    category: UnitCategory.Siege, noTerrainBonus: true, cannotAttack: true,
  },
  {
    id: UnitTypeId.Galley, name: 'Galley', letter: 'G', strength: 3, movement: 3, isNaval: true,
    sprite: 'work_boat', category: UnitCategory.Naval,
  },
  {
    id: UnitTypeId.Scout, name: 'Scout', letter: 'O', strength: 1, movement: 2, isNaval: false,
    sprite: 'scout', category: UnitCategory.NonCombat, cannotAttack: true,
  },
  // Immovable — placed by FoundCity action, never added to the turn-cycle pending set
  {
    id: UnitTypeId.City, name: 'City', letter: 'C', strength: 0, movement: 0, isNaval: false,
    category: UnitCategory.NonCombat, cannotAttack: true,
  },
]

export const UNIT_MAP = new Map(UNIT_DEFS.map(u => [u.id, u]))

/** Defense bonus (%) granted by tile features (Forest, Jungle). */
export const FEATURE_DEFENSE_BONUS = new Map<FeatureType, number>([
  [FeatureType.Forest, 50],
  [FeatureType.Jungle, 50],
])
