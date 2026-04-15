import type { DiplomacyMap, DiplomaticRelation, DiplomacyEvent } from './types'
import type { Player } from '../Game'
import {
  getRelation,
  computeScore,
  declareWar,
  makePeace,
  openBorders,
  cancelOpenBorders,
} from './relations'

/**
 * Runs one AI player's diplomacy pass against the human player (id = 1).
 * At most one action fires per call. Returns the updated map and any events.
 */
export function runAIDiplomacy(
  map:      DiplomacyMap,
  aiPlayer: Player,
  _players: readonly Player[],
  turn:     number,
): { nextMap: Map<string, DiplomaticRelation>; events: DiplomacyEvent[] } {
  const humanId = 1
  const aiId    = aiPlayer.id
  if (aiId === humanId) return { nextMap: new Map(map), events: [] }

  const humanToAI = getRelation(map, humanId, aiId)
  const score     = computeScore(humanToAI)
  const events: DiplomacyEvent[] = []
  let nextMap: Map<string, DiplomaticRelation> = new Map(map)

  if (humanToAI.status === 'peace') {
    if (score < -20 && Math.random() < 0.20) {
      nextMap = declareWar(nextMap, aiId, humanId)
      events.push({ turn, fromId: aiId, toId: humanId, action: 'war',         isAI: true })
    } else if (score >= 8 && Math.random() < 0.20) {
      nextMap = openBorders(nextMap, aiId, humanId)
      events.push({ turn, fromId: aiId, toId: humanId, action: 'openBorders', isAI: true })
    }
  } else if (humanToAI.status === 'war') {
    if (score >= -5 && Math.random() < 0.30) {
      nextMap = makePeace(nextMap, aiId, humanId)
      events.push({ turn, fromId: aiId, toId: humanId, action: 'peace',       isAI: true })
    }
  } else if (humanToAI.status === 'openBorders') {
    if (score < -5 && Math.random() < 0.15) {
      nextMap = cancelOpenBorders(nextMap, aiId, humanId)
      events.push({ turn, fromId: aiId, toId: humanId, action: 'cancelOpenBorders', isAI: true })
    }
  }

  return { nextMap, events }
}
