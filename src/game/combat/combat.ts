/**
 * Pure combat resolver — no SharedArrayBuffer access, no renderer or store imports.
 * All inputs are plain data; randomness is injected via the `rand` parameter.
 */
import { TERRAIN_MAP }         from '../../data/terrains'
import { FEATURE_DEFENSE_BONUS } from '../../data/units'
import {
  TILE_STRIDE, TILE_RIVER,
  RIVER_N, RIVER_E, RIVER_S, RIVER_W,
} from '../../shared/constants'
import type { CombatantStats, CombatRound, CombatResult } from './types'

// ── Strength calculation ──────────────────────────────────────────────────────

/**
 * Computes the effective (modified) combat strength for one combatant.
 *
 * All percentage bonuses are additive before being applied as a multiplier,
 * matching the Civ 4 formula. HP scaling is applied last so that wounded
 * units fight at reduced effectiveness.
 *
 * @param unit          The combatant whose strength we are computing.
 * @param opponent      The opposing combatant (used for type-matchup bonuses).
 * @param isAttacker    True when computing the attacker's strength.
 * @param crossingRiver True when the attacker is crossing a river edge.
 */
export function computeModifiedStrength(
  unit:          CombatantStats,
  opponent:      CombatantStats,
  isAttacker:    boolean,
  crossingRiver: boolean,
): number {
  if (unit.baseStrength === 0) return 0

  // Collect all additive percentage bonuses
  let bonusPct = 0

  for (const bonus of unit.combatBonuses) {
    if (bonus.onlyWhenAttacking && !isAttacker) continue
    if (bonus.onlyWhenDefending &&  isAttacker) continue

    if (bonus.vsCategory != null && bonus.vsCategory === opponent.category) {
      bonusPct += bonus.pct
    }
    if (bonus.vsCity) {
      const cityTarget = isAttacker ? opponent.isInCity : unit.isInCity
      if (cityTarget) bonusPct += bonus.pct
    }
    if (bonus.vsTerrain != null && !isAttacker && unit.terrain === bonus.vsTerrain) {
      bonusPct += bonus.pct
    }
  }

  // Terrain and feature defense bonuses (defender only; Mounted/Siege ignore these)
  if (!isAttacker && !unit.noTerrainBonus) {
    bonusPct += TERRAIN_MAP.get(unit.terrain)?.defense ?? 0
    bonusPct += FEATURE_DEFENSE_BONUS.get(unit.feature) ?? 0
  }

  // Fortification bonus (defender only): +10% after 2 turns, +25% after 5+ turns
  if (!isAttacker) {
    if      (unit.fortifyTurns >= 5) bonusPct += 25
    else if (unit.fortifyTurns >= 2) bonusPct += 10
  }

  // City defense bonus: flat +25% when defending in a city tile
  if (!isAttacker && unit.isInCity) bonusPct += 25

  // River-crossing penalty: -25% for the attacker only
  if (isAttacker && crossingRiver) bonusPct -= 25

  // Scale by current HP (wounded units fight at reduced strength)
  const effective = unit.baseStrength * (1 + bonusPct / 100) * (unit.currentHp / 100)
  return Math.max(effective, 0.001)  // guard against division by zero
}

// ── Combat resolver ───────────────────────────────────────────────────────────

/**
 * Resolves a full round-by-round combat between an attacker and a defender.
 *
 * Uses the Civ 4 formula:
 *   • Win probability per round (attacker): A / (A + D)
 *   • Attacker damage per round:  floor(20 × (3A + D) / (3D + A))
 *   • Defender damage per round:  floor(20 × (3D + A) / (3A + D))
 *
 * Both units take damage each round (one per round wins, the other takes none
 * that round). Combat ends when either unit's HP reaches 0.
 *
 * @param attacker      Stats for the attacking unit.
 * @param defender      Stats for the defending unit.
 * @param crossingRiver True if the attacker is crossing a river edge.
 * @param rand          Injected RNG — defaults to Math.random().
 *                      Pass a deterministic function in tests, e.g. () => 0.5,
 *                      or a seeded PRNG for reproducible replays.
 *                      Game.setRand() exposes this to the host application.
 */
export function resolveCombat(
  attacker:      CombatantStats,
  defender:      CombatantStats,
  crossingRiver: boolean,
  rand:          () => number = Math.random,
): CombatResult {
  // Non-combat defenders (strength 0) are captured instantly — no rounds fought
  if (defender.baseStrength === 0) {
    return {
      attackerWon:      true,
      attackerHpFinal:  attacker.currentHp,
      defenderHpFinal:  0,
      rounds:           [],
      defenderCaptured: true,
    }
  }

  const A = computeModifiedStrength(attacker, defender, true,  crossingRiver)
  const D = computeModifiedStrength(defender, attacker, false, false)

  // Attacker's probability of winning each individual round
  const attackerWinProb = A / (A + D)

  // Damage dealt per round (Civ 4 formula, symmetric)
  const atkDmg = Math.floor(20 * (3 * A + D) / (3 * D + A))
  const defDmg = Math.floor(20 * (3 * D + A) / (3 * A + D))

  let atkHp = attacker.currentHp
  let defHp = defender.currentHp
  const rounds: CombatRound[] = []

  while (atkHp > 0 && defHp > 0) {
    // rand() > (1 - p) is equivalent to rand() < p in probability, but maps
    // high rand values → attacker wins, which matches RAND_HIGH / RAND_LOW semantics.
    const attackerWinsRound = rand() > (1 - attackerWinProb)
    const aDealt = attackerWinsRound ? atkDmg : 0
    const dDealt = attackerWinsRound ? 0       : defDmg

    defHp = Math.max(0, defHp - aDealt)
    atkHp = Math.max(0, atkHp - dDealt)

    rounds.push({
      attackerDealt:   aDealt,
      defenderDealt:   dDealt,
      attackerHpAfter: atkHp,
      defenderHpAfter: defHp,
    })
  }

  return {
    attackerWon:      defHp === 0,
    attackerHpFinal:  atkHp,
    defenderHpFinal:  defHp,
    rounds,
    defenderCaptured: false,
  }
}

// ── Combat odds ──────────────────────────────────────────────────────────────

/**
 * Returns the attacker's exact probability of winning (0–1) using the
 * negative-binomial formula from Civ 4.
 *
 * P(attacker wins) = Σ_{k=0}^{n_d-1} C(n_a+k-1, k) · p^n_a · q^k
 *
 * where n_a = rounds attacker needs (ceil(defHP / atkDmg)),
 *       n_d = rounds defender needs (ceil(atkHP / defDmg)),
 *       p   = A / (A + D),  q = 1 – p.
 */
export function computeCombatOdds(
  attacker:      CombatantStats,
  defender:      CombatantStats,
  crossingRiver: boolean,
): number {
  if (defender.baseStrength === 0) return 1.0   // non-combat → instant capture
  if (attacker.baseStrength === 0) return 0.0

  const A = computeModifiedStrength(attacker, defender, true,  crossingRiver)
  const D = computeModifiedStrength(defender, attacker, false, false)

  const p = A / (A + D)
  const q = 1 - p

  const atkDmg = Math.max(1, Math.floor(20 * (3 * A + D) / (3 * D + A)))
  const defDmg = Math.max(1, Math.floor(20 * (3 * D + A) / (3 * A + D)))

  const n_a = Math.ceil(defender.currentHp / atkDmg)
  const n_d = Math.ceil(attacker.currentHp / defDmg)

  let pWin = 0
  let term = Math.pow(p, n_a)   // k=0: C(n_a-1,0)·p^n_a·q^0

  for (let k = 0; k < n_d; k++) {
    if (k > 0) term *= q * (n_a + k - 1) / k
    pWin += term
  }

  return Math.min(1, Math.max(0, pWin))
}

// ── River-crossing helper ─────────────────────────────────────────────────────

/**
 * Returns true if moving from (ax, ay) to (dx, dy) crosses a river edge.
 *
 * Only cardinal moves (N/S/E/W) can cross rivers; diagonal moves never incur
 * the penalty. The river bitmask is read from the attacker's tile (TILE_RIVER
 * byte, offsets RIVER_N/E/S/W from src/shared/constants).
 */
export function crossesRiver(
  tileBytes: Uint8Array,
  mapWidth:  number,
  ax: number, ay: number,
  dx: number, dy: number,
): boolean {
  // Diagonal moves — no river crossing penalty
  if (ax !== dx && ay !== dy) return false

  const aTileOff = (ay * mapWidth + ax) * TILE_STRIDE
  const river    = tileBytes[aTileOff + TILE_RIVER]

  if (dx === ax     && dy === ay - 1) return (river & RIVER_N) !== 0  // moving North
  if (dx === ax     && dy === ay + 1) return (river & RIVER_S) !== 0  // moving South
  if (dx === ax + 1 && dy === ay    ) return (river & RIVER_E) !== 0  // moving East
  if (dx === ax - 1 && dy === ay    ) return (river & RIVER_W) !== 0  // moving West
  return false
}
