import type { DiplomacyMap, DiplomaticRelation } from './types'
import { DEFAULT_RELATION, relationKey } from './types'

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getRelation(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): DiplomaticRelation {
  return map.get(relationKey(fromId, toId)) ?? DEFAULT_RELATION
}

// ── Score formula ─────────────────────────────────────────────────────────────

/**
 * Derives the glance score from the accumulated modifiers.
 * Positive = friendly, negative = hostile.
 */
export function computeScore(rel: DiplomaticRelation): number {
  const peacePts       =  Math.min(rel.peaceTurns       * 0.25, 5)
  const openBordersPts =  Math.min(rel.openBordersTurns * 0.50, 8)
  const sharedWarPts   =  Math.min(rel.sharedWarTurns   * 0.50, 6)
  const warMemPenalty  = -Math.min(rel.warMemoryTurns   * 1.50, 30)
  const atWarFlat      = rel.status === 'war'      ? -20 : 0
  const allianceFlat   = rel.status === 'alliance' ?  15 : 0
  return Math.round(
    peacePts + openBordersPts + sharedWarPts + warMemPenalty + atWarFlat + allianceFlat,
  )
}

// ── Initialisation ────────────────────────────────────────────────────────────

/** Creates a fresh DiplomacyMap for players with ids 1..numPlayers. */
export function initDiplomacy(numPlayers: number): Map<string, DiplomaticRelation> {
  const map = new Map<string, DiplomaticRelation>()
  for (let i = 1; i <= numPlayers; i++) {
    for (let j = 1; j <= numPlayers; j++) {
      if (i !== j) map.set(relationKey(i, j), { ...DEFAULT_RELATION })
    }
  }
  return map
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function mutate(
  base:   DiplomacyMap,
  fromId: number,
  toId:   number,
  patch:  Partial<DiplomaticRelation>,
): Map<string, DiplomaticRelation> {
  const next = new Map(base)
  const rel  = getRelation(base, fromId, toId)
  next.set(relationKey(fromId, toId), { ...rel, ...patch })
  return next
}

function mutateBoth(
  base:  DiplomacyMap,
  a:     number,
  b:     number,
  patch: Partial<DiplomaticRelation>,
): Map<string, DiplomaticRelation> {
  const next = new Map(base)
  next.set(relationKey(a, b), { ...getRelation(base, a, b), ...patch })
  next.set(relationKey(b, a), { ...getRelation(base, b, a), ...patch })
  return next
}

// ── Diplomatic actions (all bilateral) ───────────────────────────────────────

/**
 * Declares war from `fromId` on `toId`. Both directions become 'war'.
 * The target remembers the declaration (+8 warMemoryTurns on B→A).
 */
export function declareWar(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  // A→B: war, peaceTurns reset
  let next = mutate(map, fromId, toId, { status: 'war', peaceTurns: 0, openBordersTurns: 0 })
  // B→A: war + declaration memory
  const relBA = getRelation(map, toId, fromId)
  next.set(relationKey(toId, fromId), {
    ...relBA,
    status:          'war',
    peaceTurns:      0,
    openBordersTurns: 0,
    warMemoryTurns:  relBA.warMemoryTurns + 8,
  })
  return next
}

/** Both sides become 'peace'. Open borders turns reset. */
export function makePeace(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  return mutateBoth(map, fromId, toId, { status: 'peace', openBordersTurns: 0 })
}

/** Both sides gain 'openBorders' status. */
export function openBorders(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  return mutateBoth(map, fromId, toId, { status: 'openBorders' })
}

/** Both sides revert to 'peace'. Open borders turns reset. */
export function cancelOpenBorders(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  return mutateBoth(map, fromId, toId, { status: 'peace', openBordersTurns: 0 })
}

/** Both sides gain 'alliance' status. */
export function proposeAlliance(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  return mutateBoth(map, fromId, toId, { status: 'alliance' })
}

/**
 * Breaks the alliance. Both revert to 'peace'.
 * The non-initiating side gains +5 warMemoryTurns (betrayal memory).
 */
export function breakAlliance(
  map:    DiplomacyMap,
  fromId: number,
  toId:   number,
): Map<string, DiplomaticRelation> {
  let next = mutate(map, fromId, toId, { status: 'peace' })
  const relBA = getRelation(map, toId, fromId)
  next.set(relationKey(toId, fromId), {
    ...relBA,
    status:         'peace',
    warMemoryTurns: relBA.warMemoryTurns + 5,
  })
  return next
}

// ── Per-turn advancement ──────────────────────────────────────────────────────

/**
 * Advances all per-turn modifiers for every directed pair.
 * Called once per full game round (when the last player ends their turn).
 */
export function advanceDiplomacyTurn(
  map:       DiplomacyMap,
  playerIds: readonly number[],
): Map<string, DiplomaticRelation> {
  const next = new Map(map)

  for (const fromId of playerIds) {
    for (const toId of playerIds) {
      if (fromId === toId) continue
      const rel = getRelation(map, fromId, toId)
      let { status, warMemoryTurns, openBordersTurns, peaceTurns, sharedWarTurns } = rel

      if (status === 'war') {
        warMemoryTurns += 1
        peaceTurns      = 0
        openBordersTurns = 0
      } else {
        peaceTurns += 1
        if (warMemoryTurns > 0) warMemoryTurns -= 1
      }

      if (status === 'openBorders' || status === 'alliance') {
        openBordersTurns += 1
      }

      // Shared war bonus: fromId and toId are both at war with the same third party
      let sharedEnemy = false
      for (const thirdId of playerIds) {
        if (thirdId === fromId || thirdId === toId) continue
        const fromVsThird = getRelation(map, fromId, thirdId)
        const toVsThird   = getRelation(map, toId,   thirdId)
        if (fromVsThird.status === 'war' && toVsThird.status === 'war') {
          sharedEnemy = true
          break
        }
      }
      if (sharedEnemy) sharedWarTurns += 1

      next.set(relationKey(fromId, toId), {
        status, warMemoryTurns, openBordersTurns, peaceTurns, sharedWarTurns,
      })
    }
  }

  return next
}
