import type { UnitCategory, TerrainType, FeatureType, CombatBonus } from '../../shared/types'

export interface CombatantStats {
  uid:            number
  baseStrength:   number
  currentHp:      number    // 0–100
  category:       UnitCategory
  civId:          number
  tileX:          number
  tileY:          number
  terrain:        TerrainType
  feature:        FeatureType
  /** A City unit exists on the same tile. */
  isInCity:       boolean
  /** Consecutive turns fortified (0 = not fortified). */
  fortifyTurns:   number
  cannotAttack:   boolean
  noTerrainBonus: boolean
  combatBonuses:  CombatBonus[]
}

export interface CombatRound {
  attackerDealt:   number
  defenderDealt:   number
  attackerHpAfter: number
  defenderHpAfter: number
}

export interface CombatResult {
  attackerWon:      boolean
  attackerHpFinal:  number
  defenderHpFinal:  number
  rounds:           CombatRound[]
  /** True if defender was non-combat (strength 0) — they are captured, not destroyed. */
  defenderCaptured: boolean
}
