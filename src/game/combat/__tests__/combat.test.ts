import { describe, it, expect } from 'vitest'
import { resolveCombat, computeModifiedStrength, crossesRiver } from '../combat'
import type { CombatantStats } from '../types'
import { UnitCategory, TerrainType, FeatureType } from '../../../shared/types'
import { TILE_STRIDE, TILE_RIVER, RIVER_E, RIVER_N, RIVER_S, RIVER_W } from '../../../shared/constants'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeCombatant(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    uid:            0,
    baseStrength:   5,
    currentHp:      100,
    category:       UnitCategory.Melee,
    civId:          1,
    tileX:          0,
    tileY:          0,
    terrain:        TerrainType.Grassland,
    feature:        FeatureType.None,
    isInCity:       false,
    fortifyTurns:   0,
    cannotAttack:   false,
    noTerrainBonus: false,
    combatBonuses:  [],
    ...overrides,
  }
}

const RAND_HIGH = () => 0.99  // attacker wins every round
const RAND_LOW  = () => 0.01  // defender wins every round

// ── resolveCombat — basic outcomes ────────────────────────────────────────────

describe('resolveCombat — basic outcomes', () => {
  it('attacker with RAND_HIGH wins against equal-strength defender', () => {
    const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_HIGH)
    expect(result.attackerWon).toBe(true)
    expect(result.defenderHpFinal).toBe(0)
    expect(result.attackerHpFinal).toBeGreaterThan(0)
    expect(result.defenderCaptured).toBe(false)
  })

  it('defender wins when RAND_LOW (attacker never wins a round)', () => {
    const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_LOW)
    expect(result.attackerWon).toBe(false)
    expect(result.attackerHpFinal).toBe(0)
    expect(result.defenderHpFinal).toBeGreaterThan(0)
  })

  it('both units take damage when rounds alternate', () => {
    let i = 0
    const altRand = () => (i++ % 2 === 0 ? 0.99 : 0.01)
    const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, altRand)
    const totalDmgToDefender = result.rounds.reduce((s, r) => s + r.attackerDealt, 0)
    const totalDmgToAttacker = result.rounds.reduce((s, r) => s + r.defenderDealt, 0)
    expect(totalDmgToDefender).toBeGreaterThan(0)
    expect(totalDmgToAttacker).toBeGreaterThan(0)
  })

  it('HP is tracked round-by-round in the rounds array', () => {
    const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_HIGH)
    expect(result.rounds.length).toBeGreaterThan(0)
    // Last round should bring defender to 0
    const last = result.rounds[result.rounds.length - 1]
    expect(last.defenderHpAfter).toBe(0)
  })

  it('non-combat defender (strength 0) is captured instantly with 0 rounds', () => {
    const nonCombat = makeCombatant({ baseStrength: 0, civId: 2 })
    const result = resolveCombat(makeCombatant(), nonCombat, false, RAND_HIGH)
    expect(result.attackerWon).toBe(true)
    expect(result.defenderCaptured).toBe(true)
    expect(result.rounds).toHaveLength(0)
    expect(result.attackerHpFinal).toBe(100)  // attacker unharmed
    expect(result.defenderHpFinal).toBe(0)
  })

  it('HP never goes below 0', () => {
    const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_HIGH)
    for (const r of result.rounds) {
      expect(r.attackerHpAfter).toBeGreaterThanOrEqual(0)
      expect(r.defenderHpAfter).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── resolveCombat — strength ratios ──────────────────────────────────────────

describe('resolveCombat — strength ratios', () => {
  it('strong attacker (10 str) beats weak defender (1 str) with mid rand (0.5)', () => {
    // 10:1 ratio → win prob per round ≈ 91%; rand=0.5 always wins round
    const strong = makeCombatant({ baseStrength: 10 })
    const weak   = makeCombatant({ baseStrength: 1, civId: 2 })
    const result = resolveCombat(strong, weak, false, () => 0.5)
    expect(result.attackerWon).toBe(true)
  })

  it('weaker attacker can still win with lucky rand (randomness factor)', () => {
    const weak   = makeCombatant({ baseStrength: 2 })
    const strong = makeCombatant({ baseStrength: 8, civId: 2 })
    const result = resolveCombat(weak, strong, false, RAND_HIGH)
    expect(result.attackerWon).toBe(true)
  })

  it('equal strength gives 50/50 odds per round', () => {
    // With equal strength, rand=0.5 should be a borderline win
    // The attacker win probability is exactly 0.5, so rand < 0.5 is false
    const a = makeCombatant({ baseStrength: 5 })
    const d = makeCombatant({ baseStrength: 5, civId: 2 })
    const result = resolveCombat(a, d, false, () => 0.5)
    // rand() < 0.5 is false → defender wins every round → attacker loses
    expect(result.attackerWon).toBe(false)
  })
})

// ── computeModifiedStrength — terrain bonuses ─────────────────────────────────

describe('computeModifiedStrength — terrain bonuses', () => {
  it('defender on Hill gains +25% effective strength', () => {
    const defender = makeCombatant({ terrain: TerrainType.Hill })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.25, 4)
  })

  it('Forest feature gives defender +50% effective strength', () => {
    const defender = makeCombatant({ feature: FeatureType.Forest })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.50, 4)
  })

  it('Jungle feature gives defender +50% effective strength', () => {
    const defender = makeCombatant({ feature: FeatureType.Jungle })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.50, 4)
  })

  it('Mounted unit (noTerrainBonus) ignores Hill defense bonus', () => {
    const mounted = makeCombatant({ noTerrainBonus: true, terrain: TerrainType.Hill })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(mounted, opponent, false, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('Siege unit (noTerrainBonus) ignores Forest feature bonus', () => {
    const siege = makeCombatant({ noTerrainBonus: true, feature: FeatureType.Forest })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(siege, opponent, false, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('Hill + Forest bonuses stack additively (+75% total)', () => {
    const defender = makeCombatant({ terrain: TerrainType.Hill, feature: FeatureType.Forest })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * (1 + 0.25 + 0.50), 4)
  })

  it('terrain bonuses do not apply to attackers', () => {
    const attacker = makeCombatant({ terrain: TerrainType.Hill, feature: FeatureType.Forest })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(attacker, opponent, true, false)
    expect(str).toBeCloseTo(5, 4)  // no terrain bonus when attacking
  })
})

// ── computeModifiedStrength — unit type bonuses ───────────────────────────────

describe('computeModifiedStrength — unit type bonuses', () => {
  it('Spearman gets +100% vs Mounted', () => {
    const spearman = makeCombatant({
      combatBonuses: [{ vsCategory: UnitCategory.Mounted, pct: 100 }],
    })
    const knight = makeCombatant({ category: UnitCategory.Mounted, civId: 2 })
    const str = computeModifiedStrength(spearman, knight, true, false)
    expect(str).toBeCloseTo(5 * 2.0, 4)
  })

  it('type bonus does not apply against the wrong category', () => {
    const spearman = makeCombatant({
      combatBonuses: [{ vsCategory: UnitCategory.Mounted, pct: 100 }],
    })
    const archer = makeCombatant({ category: UnitCategory.Archery, civId: 2 })
    const str = computeModifiedStrength(spearman, archer, true, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('onlyWhenAttacking bonus is ignored when defending', () => {
    const unit = makeCombatant({
      combatBonuses: [{ vsCategory: UnitCategory.Melee, pct: 50, onlyWhenAttacking: true }],
    })
    const opp = makeCombatant({ civId: 2 })
    const defStr = computeModifiedStrength(unit, opp, false, false)
    expect(defStr).toBeCloseTo(5, 4)  // no bonus when defending
  })

  it('onlyWhenDefending bonus is ignored when attacking', () => {
    const unit = makeCombatant({
      combatBonuses: [{ vsCategory: UnitCategory.Melee, pct: 50, onlyWhenDefending: true }],
    })
    const opp = makeCombatant({ civId: 2 })
    const atkStr = computeModifiedStrength(unit, opp, true, false)
    expect(atkStr).toBeCloseTo(5, 4)  // no bonus when attacking
  })
})

// ── computeModifiedStrength — HP scaling ─────────────────────────────────────

describe('computeModifiedStrength — HP scaling', () => {
  it('unit at 50 HP fights at 50% effective strength', () => {
    const unit = makeCombatant({ currentHp: 50 })
    const opp  = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(unit, opp, true, false)
    expect(str).toBeCloseTo(2.5, 4)
  })

  it('unit at 100 HP fights at full strength', () => {
    const unit = makeCombatant({ currentHp: 100 })
    const opp  = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(unit, opp, true, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('unit at 1 HP still resolves without error (no divide-by-zero)', () => {
    const unit = makeCombatant({ currentHp: 1 })
    const opp  = makeCombatant({ civId: 2 })
    expect(() => computeModifiedStrength(unit, opp, true, false)).not.toThrow()
    const str = computeModifiedStrength(unit, opp, true, false)
    expect(str).toBeGreaterThan(0)
  })

  it('unit with strength 0 returns 0 regardless of HP', () => {
    const unit = makeCombatant({ baseStrength: 0, currentHp: 100 })
    const opp  = makeCombatant({ civId: 2 })
    expect(computeModifiedStrength(unit, opp, true, false)).toBe(0)
  })
})

// ── computeModifiedStrength — fortification ───────────────────────────────────

describe('computeModifiedStrength — fortification', () => {
  it('1 turn fortified gives no bonus (threshold is 2)', () => {
    const defender = makeCombatant({ fortifyTurns: 1 })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('2 turns fortified gives +10% defense', () => {
    const defender = makeCombatant({ fortifyTurns: 2 })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.10, 4)
  })

  it('5 turns fortified gives +25% defense (maximum)', () => {
    const defender = makeCombatant({ fortifyTurns: 5 })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.25, 4)
  })

  it('10 turns fortified still gives only +25% (cap)', () => {
    const defender = makeCombatant({ fortifyTurns: 10 })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.25, 4)
  })

  it('fortification bonus does not apply to attackers', () => {
    const attacker = makeCombatant({ fortifyTurns: 5 })
    const defender = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(attacker, defender, true, false)
    expect(str).toBeCloseTo(5, 4)
  })
})

// ── computeModifiedStrength — city defense ────────────────────────────────────

describe('computeModifiedStrength — city defense', () => {
  it('unit in city gets +25% flat city defense', () => {
    const defender = makeCombatant({ isInCity: true })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * 1.25, 4)
  })

  it('city bonus stacks with terrain bonus additively', () => {
    const defender = makeCombatant({ isInCity: true, terrain: TerrainType.Hill })
    const opponent = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, opponent, false, false)
    expect(str).toBeCloseTo(5 * (1 + 0.25 + 0.25), 4)  // hill 25% + city 25%
  })

  it('Swordsman gets +10% when attacking a city tile', () => {
    const swordsman = makeCombatant({
      combatBonuses: [{ vsCity: true, pct: 10, onlyWhenAttacking: true }],
    })
    const cityDefender = makeCombatant({ isInCity: true, civId: 2 })
    const str = computeModifiedStrength(swordsman, cityDefender, true, false)
    expect(str).toBeCloseTo(5 * 1.10, 4)
  })

  it('city attack bonus does not apply when target is not in a city', () => {
    const swordsman = makeCombatant({
      combatBonuses: [{ vsCity: true, pct: 10, onlyWhenAttacking: true }],
    })
    const fieldDefender = makeCombatant({ isInCity: false, civId: 2 })
    const str = computeModifiedStrength(swordsman, fieldDefender, true, false)
    expect(str).toBeCloseTo(5, 4)
  })

  it('Warrior city defense bonus does not apply when defending outside a city', () => {
    const warrior = makeCombatant({
      combatBonuses: [{ vsCity: true, pct: 25, onlyWhenDefending: true }],
    })
    const attacker = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(warrior, attacker, false, false)
    expect(str).toBeCloseTo(5, 4)  // not in city, no bonus
  })
})

// ── computeModifiedStrength — river crossing ──────────────────────────────────

describe('computeModifiedStrength — river crossing', () => {
  it('attacker crossing a river gets -25% penalty', () => {
    const attacker = makeCombatant()
    const defender = makeCombatant({ civId: 2 })
    const strWithRiver    = computeModifiedStrength(attacker, defender, true, true)
    const strWithoutRiver = computeModifiedStrength(attacker, defender, true, false)
    expect(strWithRiver).toBeCloseTo(strWithoutRiver * 0.75, 4)
  })

  it('river penalty only applies to attacker, not defender', () => {
    const defender = makeCombatant()
    const attacker = makeCombatant({ civId: 2 })
    const str = computeModifiedStrength(defender, attacker, false, true)
    expect(str).toBeCloseTo(5, 4)
  })

  it('combined bonuses and river penalty are additive (Hill defender, river attacker)', () => {
    // Attacker: base 5, -25% river → effective 5 * 0.75 = 3.75
    const attacker = makeCombatant({ baseStrength: 5 })
    const defender = makeCombatant({ baseStrength: 5, terrain: TerrainType.Hill, civId: 2 })
    const atkStr = computeModifiedStrength(attacker, defender, true,  true)
    const defStr = computeModifiedStrength(defender, attacker, false, false)
    expect(atkStr).toBeCloseTo(5 * 0.75, 4)
    expect(defStr).toBeCloseTo(5 * 1.25, 4)
  })
})

// ── crossesRiver ──────────────────────────────────────────────────────────────

describe('crossesRiver', () => {
  function makeTileBytes(riverBitmask: number): Uint8Array {
    // 4×1 map (4 tiles wide, 1 row) — only tile at (0,0) has river data
    const bytes = new Uint8Array(TILE_STRIDE * 4)
    bytes[0 * TILE_STRIDE + TILE_RIVER] = riverBitmask
    return bytes
  }

  it('detects river on east edge when moving east', () => {
    const bytes = makeTileBytes(RIVER_E)
    expect(crossesRiver(bytes, 4, 0, 0, 1, 0)).toBe(true)
  })

  it('detects river on north edge when moving north', () => {
    // 2-row map so (0,1) is valid; river on tile (0,1) moving to (0,0)
    const bytes = new Uint8Array(TILE_STRIDE * 4)
    bytes[1 * TILE_STRIDE * 2 + TILE_RIVER] = 0  // not needed — check attacker tile
    // attacker at (0,1), moving north to (0,0): check RIVER_N on attacker tile (0,1)
    const b2 = new Uint8Array(TILE_STRIDE * 4)
    b2[1 * TILE_STRIDE + TILE_RIVER] = RIVER_N  // row 0 col 1 = offset TILE_STRIDE (width=2)
    // Actually let's build a 2×2 map
    const w = 2
    const b3 = new Uint8Array(TILE_STRIDE * w * 2)
    // attacker at (0,1): byte offset = (1*2+0)*TILE_STRIDE
    b3[(1 * w + 0) * TILE_STRIDE + TILE_RIVER] = RIVER_N
    expect(crossesRiver(b3, w, 0, 1, 0, 0)).toBe(true)
  })

  it('detects river on south edge when moving south', () => {
    const bytes = makeTileBytes(RIVER_S)
    expect(crossesRiver(bytes, 4, 0, 0, 0, 1)).toBe(true)
  })

  it('detects river on west edge when moving west', () => {
    // Attacker at (1,0), moving west to (0,0): check RIVER_W on tile (1,0)
    const bytes = new Uint8Array(TILE_STRIDE * 4)
    bytes[1 * TILE_STRIDE + TILE_RIVER] = RIVER_W
    expect(crossesRiver(bytes, 4, 1, 0, 0, 0)).toBe(true)
  })

  it('returns false for diagonal move regardless of all river bits set', () => {
    const bytes = makeTileBytes(0xFF)
    expect(crossesRiver(bytes, 4, 0, 0, 1, 1)).toBe(false)
  })

  it('returns false when no river on the relevant edge', () => {
    const bytes = makeTileBytes(0)
    expect(crossesRiver(bytes, 4, 0, 0, 1, 0)).toBe(false)
  })

  it('returns false when river is on a different edge than the direction of movement', () => {
    const bytes = makeTileBytes(RIVER_N)  // river on north, but moving east
    expect(crossesRiver(bytes, 4, 0, 0, 1, 0)).toBe(false)
  })
})
