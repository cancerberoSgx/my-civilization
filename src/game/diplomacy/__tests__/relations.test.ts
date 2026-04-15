import { describe, it, expect } from 'vitest'
import {
  initDiplomacy,
  getRelation,
  computeScore,
  declareWar,
  makePeace,
  openBorders,
  cancelOpenBorders,
  proposeAlliance,
  breakAlliance,
  advanceDiplomacyTurn,
} from '../relations'
import { DEFAULT_RELATION } from '../types'

// ── computeScore ──────────────────────────────────────────────────────────────

describe('computeScore', () => {
  it('returns 0 for the default relation', () => {
    expect(computeScore(DEFAULT_RELATION)).toBe(0)
  })

  it('applies peace bonus, capped at +5', () => {
    expect(computeScore({ ...DEFAULT_RELATION, peaceTurns: 8 })).toBe(2)    // 8 * 0.25 = 2
    expect(computeScore({ ...DEFAULT_RELATION, peaceTurns: 20 })).toBe(5)   // cap = 5
    expect(computeScore({ ...DEFAULT_RELATION, peaceTurns: 100 })).toBe(5)  // still capped
  })

  it('applies open borders bonus, capped at +8', () => {
    expect(computeScore({ ...DEFAULT_RELATION, openBordersTurns: 4 })).toBe(2)    // 4 * 0.5 = 2
    expect(computeScore({ ...DEFAULT_RELATION, openBordersTurns: 16 })).toBe(8)   // cap = 8
    expect(computeScore({ ...DEFAULT_RELATION, openBordersTurns: 100 })).toBe(8)  // still capped
  })

  it('applies shared war bonus, capped at +6', () => {
    expect(computeScore({ ...DEFAULT_RELATION, sharedWarTurns: 4 })).toBe(2)    // 4 * 0.5 = 2
    expect(computeScore({ ...DEFAULT_RELATION, sharedWarTurns: 12 })).toBe(6)   // cap = 6
  })

  it('applies war memory penalty, capped at −30', () => {
    expect(computeScore({ ...DEFAULT_RELATION, warMemoryTurns: 4 })).toBe(-6)   // 4 * 1.5 = 6 → round(-6) = -6
    expect(computeScore({ ...DEFAULT_RELATION, warMemoryTurns: 20 })).toBe(-30) // cap = 30
  })

  it('applies flat −20 penalty while at war', () => {
    const rel = { ...DEFAULT_RELATION, status: 'war' as const }
    expect(computeScore(rel)).toBe(-20)
  })

  it('combines war status + war memory', () => {
    const rel = { ...DEFAULT_RELATION, status: 'war' as const, warMemoryTurns: 4 }
    expect(computeScore(rel)).toBe(-26)  // -20 - 6
  })

  it('applies flat +15 bonus for alliance', () => {
    const rel = { ...DEFAULT_RELATION, status: 'alliance' as const }
    expect(computeScore(rel)).toBe(15)
  })

  it('stacks multiple bonuses', () => {
    // peaceTurns=20(+5) + openBordersTurns=16(+8) + alliance(+15) = +28
    const rel = {
      ...DEFAULT_RELATION,
      status: 'alliance' as const,
      peaceTurns: 20,
      openBordersTurns: 16,
    }
    expect(computeScore(rel)).toBe(28)
  })
})

// ── initDiplomacy ─────────────────────────────────────────────────────────────

describe('initDiplomacy', () => {
  it('creates entries for all ordered pairs except self', () => {
    const map = initDiplomacy(3)
    expect(map.size).toBe(6) // 3 * (3-1)
    expect(getRelation(map, 1, 2)).toEqual(DEFAULT_RELATION)
    expect(getRelation(map, 2, 1)).toEqual(DEFAULT_RELATION)
    expect(getRelation(map, 1, 3)).toEqual(DEFAULT_RELATION)
    expect(map.has('1-1')).toBe(false)
  })

  it('returns default relation for an absent pair', () => {
    const map = initDiplomacy(2)
    expect(getRelation(map, 9, 10)).toEqual(DEFAULT_RELATION)
  })
})

// ── declareWar ────────────────────────────────────────────────────────────────

describe('declareWar', () => {
  it('sets both directions to war', () => {
    const map  = initDiplomacy(2)
    const next = declareWar(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('war')
    expect(getRelation(next, 2, 1).status).toBe('war')
  })

  it("adds 8 to target's warMemoryTurns toward the initiator", () => {
    const map  = initDiplomacy(2)
    const next = declareWar(map, 1, 2)
    expect(getRelation(next, 2, 1).warMemoryTurns).toBe(8)
    expect(getRelation(next, 1, 2).warMemoryTurns).toBe(0) // initiator not affected
  })

  it('resets peaceTurns for both sides', () => {
    let map  = initDiplomacy(2)
    map = new Map([...map, ['1-2', { ...DEFAULT_RELATION, peaceTurns: 5 }]])
    map = new Map([...map, ['2-1', { ...DEFAULT_RELATION, peaceTurns: 8 }]])
    const next = declareWar(map as ReadonlyMap<string, typeof DEFAULT_RELATION>, 1, 2)
    expect(getRelation(next, 1, 2).peaceTurns).toBe(0)
    expect(getRelation(next, 2, 1).peaceTurns).toBe(0)
  })

  it('stacks warMemoryTurns on repeated declarations', () => {
    const map  = initDiplomacy(2)
    const next = declareWar(declareWar(map, 1, 2), 1, 2)
    // Second declaration adds another 8 to B→A
    expect(getRelation(next, 2, 1).warMemoryTurns).toBe(16)
  })
})

// ── makePeace ─────────────────────────────────────────────────────────────────

describe('makePeace', () => {
  it('sets both directions to peace', () => {
    const map  = declareWar(initDiplomacy(2), 1, 2)
    const next = makePeace(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('peace')
    expect(getRelation(next, 2, 1).status).toBe('peace')
  })

  it('resets openBordersTurns', () => {
    let map = initDiplomacy(2)
    map = new Map([...map, ['1-2', { ...DEFAULT_RELATION, status: 'war' as const, openBordersTurns: 5 }]])
    const next = makePeace(map, 1, 2)
    expect(getRelation(next, 1, 2).openBordersTurns).toBe(0)
  })

  it('preserves warMemoryTurns (peace does not erase memory)', () => {
    const map  = declareWar(initDiplomacy(2), 1, 2)
    const next = makePeace(map, 1, 2)
    expect(getRelation(next, 2, 1).warMemoryTurns).toBe(8) // still remembers
  })
})

// ── openBorders / cancelOpenBorders ──────────────────────────────────────────

describe('openBorders', () => {
  it('sets both directions to openBorders', () => {
    const map  = initDiplomacy(2)
    const next = openBorders(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('openBorders')
    expect(getRelation(next, 2, 1).status).toBe('openBorders')
  })
})

describe('cancelOpenBorders', () => {
  it('reverts both directions to peace', () => {
    const map  = openBorders(initDiplomacy(2), 1, 2)
    const next = cancelOpenBorders(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('peace')
    expect(getRelation(next, 2, 1).status).toBe('peace')
  })

  it('resets openBordersTurns', () => {
    let map = openBorders(initDiplomacy(2), 1, 2)
    map = new Map([...map, ['1-2', { ...DEFAULT_RELATION, status: 'openBorders' as const, openBordersTurns: 10 }]])
    const next = cancelOpenBorders(map, 1, 2)
    expect(getRelation(next, 1, 2).openBordersTurns).toBe(0)
  })
})

// ── proposeAlliance ───────────────────────────────────────────────────────────

describe('proposeAlliance', () => {
  it('sets both directions to alliance', () => {
    const map  = initDiplomacy(2)
    const next = proposeAlliance(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('alliance')
    expect(getRelation(next, 2, 1).status).toBe('alliance')
  })

  it('gives +15 flat bonus in score', () => {
    const map  = proposeAlliance(initDiplomacy(2), 1, 2)
    expect(computeScore(getRelation(map, 1, 2))).toBe(15)
  })
})

// ── breakAlliance ─────────────────────────────────────────────────────────────

describe('breakAlliance', () => {
  it('reverts both to peace', () => {
    const map  = proposeAlliance(initDiplomacy(2), 1, 2)
    const next = breakAlliance(map, 1, 2)
    expect(getRelation(next, 1, 2).status).toBe('peace')
    expect(getRelation(next, 2, 1).status).toBe('peace')
  })

  it("adds 5 warMemoryTurns to the other side (betrayal)", () => {
    const map  = proposeAlliance(initDiplomacy(2), 1, 2)
    const next = breakAlliance(map, 1, 2)  // 1 breaks alliance with 2
    expect(getRelation(next, 2, 1).warMemoryTurns).toBe(5)  // 2 remembers betrayal
    expect(getRelation(next, 1, 2).warMemoryTurns).toBe(0)  // initiator unaffected
  })
})

// ── advanceDiplomacyTurn ──────────────────────────────────────────────────────

describe('advanceDiplomacyTurn', () => {
  it('increments warMemoryTurns while at war', () => {
    const map  = declareWar(initDiplomacy(2), 1, 2)
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).warMemoryTurns).toBe(1)   // 0 + 1
    expect(getRelation(next, 2, 1).warMemoryTurns).toBe(9)   // 8 + 1
  })

  it('increments peaceTurns while at peace', () => {
    const map  = initDiplomacy(2)
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).peaceTurns).toBe(1)
    expect(getRelation(next, 2, 1).peaceTurns).toBe(1)
  })

  it('decrements warMemoryTurns while at peace (forgetting)', () => {
    let map = initDiplomacy(2)
    // Give player 1 a war memory toward player 2
    map = new Map([...map, ['1-2', { ...DEFAULT_RELATION, warMemoryTurns: 5 }]])
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).warMemoryTurns).toBe(4)  // 5 - 1
  })

  it('does not decrement warMemoryTurns below 0', () => {
    const map  = initDiplomacy(2) // warMemoryTurns = 0
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).warMemoryTurns).toBe(0)
  })

  it('increments openBordersTurns while at openBorders', () => {
    const map  = openBorders(initDiplomacy(2), 1, 2)
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).openBordersTurns).toBe(1)
    expect(getRelation(next, 2, 1).openBordersTurns).toBe(1)
  })

  it('increments openBordersTurns while in alliance', () => {
    const map  = proposeAlliance(initDiplomacy(2), 1, 2)
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).openBordersTurns).toBe(1)
  })

  it('resets peaceTurns to 0 while at war', () => {
    let map = initDiplomacy(2)
    map = new Map([...map, ['1-2', { ...DEFAULT_RELATION, status: 'war' as const, peaceTurns: 3 }]])
    const next = advanceDiplomacyTurn(map, [1, 2])
    expect(getRelation(next, 1, 2).peaceTurns).toBe(0)
  })

  it('increments sharedWarTurns when both players are at war with a third party', () => {
    // 1 and 2 are at war with 3
    let map = initDiplomacy(3)
    map = declareWar(map, 1, 3)
    map = declareWar(map, 2, 3)
    const next = advanceDiplomacyTurn(map, [1, 2, 3])
    // 1→2 and 2→1 should both gain +1 sharedWarTurns
    expect(getRelation(next, 1, 2).sharedWarTurns).toBe(1)
    expect(getRelation(next, 2, 1).sharedWarTurns).toBe(1)
  })

  it('does not increment sharedWarTurns when no common enemy', () => {
    const map  = initDiplomacy(3)
    const next = advanceDiplomacyTurn(map, [1, 2, 3])
    expect(getRelation(next, 1, 2).sharedWarTurns).toBe(0)
  })
})
