export type DiplomaticStatus = 'peace' | 'war' | 'openBorders' | 'alliance'

/**
 * Accumulated per-turn modifiers for one directed pair (from → to).
 * The glance score is derived from these fields; they are what gets stored.
 */
export interface DiplomaticRelation {
  readonly status:           DiplomaticStatus
  /** Turns since a war was declared on `from` by `to`; decays while at peace. */
  readonly warMemoryTurns:   number
  /** Turns of accumulated Open Borders or Alliance between the pair. */
  readonly openBordersTurns: number
  /** Turns of uninterrupted peace. Resets on war declaration. */
  readonly peaceTurns:       number
  /** Turns both players were simultaneously at war with a common third party. */
  readonly sharedWarTurns:   number
}

/** Key format: `"${fromId}-${toId}"`. Directed: A→B ≠ B→A. */
export type DiplomacyMap = ReadonlyMap<string, DiplomaticRelation>

export function relationKey(fromId: number, toId: number): string {
  return `${fromId}-${toId}`
}

export interface DiplomacyEvent {
  readonly turn:   number
  readonly fromId: number
  readonly toId:   number
  readonly action: DiplomaticStatus | 'cancelOpenBorders' | 'breakAlliance'
  readonly isAI:   boolean
}

export const DEFAULT_RELATION: DiplomaticRelation = {
  status:           'peace',
  warMemoryTurns:   0,
  openBordersTurns: 0,
  peaceTurns:       0,
  sharedWarTurns:   0,
}
