import { ActionId, UnitTypeId } from '../shared/types'
import type { ActionDef } from '../shared/types'

/**
 * All defined actions.  The key is ActionId; the value carries the label and
 * the pure predicate that decides whether the action is available right now.
 *
 * Fortify is universal — Game.getAvailableActions() prepends it automatically
 * for every unit that still has moves.  It is included here so callers can
 * look up its label / id without special-casing.
 */
export const ACTION_DEFS = new Map<ActionId, ActionDef>([
  [ActionId.Fortify, {
    id:         ActionId.Fortify,
    label:      'Fortify',
    canPerform: ctx => ctx.unit.movesLeft > 0,
  }],

  [ActionId.FoundCity, {
    id:         ActionId.FoundCity,
    label:      'Found City',
    canPerform: ctx => ctx.unit.typeId === UnitTypeId.Settler,
  }],
])
