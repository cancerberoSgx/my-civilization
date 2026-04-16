/**
 * Core turn-based game logic.
 *
 * Owns direct views into the SharedArrayBuffers (unit + tile data).
 * Drives the turn cycle:
 *   Human turn  → auto-focuses units one by one.  Units that have a stored
 *                 movement path auto-step at turn start (Civ-style queued
 *                 orders); others wait for right-click → requestMoveTo().
 *   AI turn     → moves every unit randomly in one synchronous pass, then
 *                 auto-advances after a short visual delay.
 *
 * All state changes are communicated via callback functions set after
 * construction — no circular imports.
 */
import {
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF, UNIT_CIV_OFF,
  UNIT_HP_OFF, UNIT_MOVES_OFF,
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE,
  MAX_UNITS,
} from '../shared/constants'
import { TerrainType, FeatureType, UnitTypeId, UnitCategory, ActionId } from '../shared/types'
import type { ActionDef, ActionContext } from '../shared/types'
import type { SavedGameState } from '../shared/saveFormat'
import { UNIT_MAP } from '../data/units'
import { ACTION_DEFS } from '../data/actions'
import { SpecialistType } from './city/types'
import type { City, CityId, TileYield, WorkedTile, CityTurnContext } from './city/types'
import { getBuildingDef } from './city/definitions'
import { processCityTurn } from './city/turnProcessor'
import { advanceDiplomacyTurn, getRelation } from './diplomacy/relations'
import { runAIDiplomacy } from './diplomacy/aiDiplomacy'
import type { DiplomacyEvent } from './diplomacy/types'
import { useGameStore } from '../ui/store'
import { TERRAIN_MAP } from '../data/terrains'
import { resolveCombat, crossesRiver } from './combat/combat'
import type { CombatantStats } from './combat/types'

// ── Player definition ─────────────────────────────────────────────────────────

export interface Player {
  id:         number   // matches UNIT_CIV_OFF value (1-based)
  name:       string
  isHuman:    boolean
  color:      number   // 0xRRGGBB for UI display
  civName:    string   // e.g. "Rome"
  leaderName: string   // e.g. "Julius Caesar"
}

/** Build a players array from config — player 1 is human, rest are AI. */
export function buildPlayers(
  numCivs:    number,
  civColors:  number[],
  playerCivs: readonly { readonly civName: string; readonly leaderName: string }[] = [],
): Player[] {
  return Array.from({ length: numCivs }, (_, i) => {
    const civ = playerCivs[i]
    return {
      id:         i + 1,
      name:       i === 0 ? 'Player 1' : `AI ${i}`,
      isHuman:    i === 0,
      color:      civColors[i + 1] ?? 0x888888,
      civName:    civ?.civName    ?? (i === 0 ? 'Player' : `AI ${i}`),
      leaderName: civ?.leaderName ?? '',
    }
  })
}

// ── A* node (module-level to avoid per-call type redeclarations) ──────────────

interface ANode { x: number; y: number; g: number; f: number; parent: ANode | null }

// ── Combat event ─────────────────────────────────────────────────────────────

export interface CombatEventForUI {
  attackerUid:     number
  defenderUid:     number
  attackerWon:     boolean
  attackerHpFinal: number
  defenderHpFinal: number
  /** Total number of combat rounds fought. */
  rounds:          number
}

// ── Callbacks wired by main.ts ────────────────────────────────────────────────

export interface GameCallbacks {
  /** Called at the very start of every turn (human or AI). */
  onTurnStart(player: Player, turn: number, pendingCount: number): void
  /** Called when the focused unit changes (human turns). Pass -1 to clear. */
  onActiveUnitChanged(unitId: number): void
  /** Called whenever a single unit moves (both human and AI). */
  onUnitMoved(unitId: number, fromX: number, fromY: number, toX: number, toY: number): void
  /** Called when valid-move tiles change (human turns). */
  onValidMovesChanged(moves: ReadonlySet<number>): void
  /** All human units are done — enable the End-Turn button. */
  onAllUnitsDone(): void
  /**
   * Called when the active unit's stored movement path changes or is cleared.
   * Fired every time a new unit becomes active (empty array if no stored path).
   */
  onPathChanged(path: ReadonlyArray<{ x: number; y: number }>): void
  /**
   * Called when the unit roster changes (unit removed or added outside of
   * normal movement — e.g. a Settler founding a City).  The renderer should
   * reload its buffer view with the new unit count.
   */
  onUnitsChanged(unitCount: number): void
  /** Called after every combat resolution with the outcome summary. */
  onCombat(event: CombatEventForUI): void
}

// ── Game ──────────────────────────────────────────────────────────────────────

export class Game {
  readonly players:   Player[]
  unitCount:          number   // mutable so placeUnit() can extend the live array
  readonly mapWidth:  number
  readonly mapHeight: number

  private currentPlayerIdx = 0
  private turnNumber       = 1

  // Encoded tile key (y * mapWidth + x) for each valid move destination
  private _validMoves  = new Set<number>()
  // Unit ids that still need to act this turn
  private _pendingIds  = new Set<number>()
  // Currently focused unit for the human player
  private _activeUnitId = -1
  // Stored multi-turn movement orders: uid → remaining waypoints (not including current position)
  private _unitPaths = new Map<number, Array<{ x: number; y: number }>>()
  // Pending AI turn timer (kept so stop() can cancel it)
  private _aiTimeout: ReturnType<typeof setTimeout> | null = null
  // RNG for combat — injectable for deterministic tests / seeded replays
  private _rand: () => number = Math.random
  // uid → consecutive turns the unit has been fortified
  private _fortifyTurns = new Map<number, number>()
  // units that explicitly chose Fortify this turn (incremented at next _beginTurn)
  private _fortifiedUids = new Set<number>()

  private readonly unitView:  DataView
  private readonly unitBytes: Uint8Array
  private readonly tileBytes: Uint8Array

  cb!: GameCallbacks    // set by caller after construction

  constructor(
    unitBuffer:  SharedArrayBuffer,
    tileBuffer:  SharedArrayBuffer,
    unitCount:   number,
    mapWidth:    number,
    mapHeight:   number,
    players:     Player[],
  ) {
    this.players   = players
    this.unitCount = unitCount
    this.mapWidth  = mapWidth
    this.mapHeight = mapHeight
    this.unitView  = new DataView(unitBuffer)
    this.unitBytes = new Uint8Array(unitBuffer)
    this.tileBytes = new Uint8Array(tileBuffer)
  }

  // ── Public read-only state ─────────────────────────────────────────────────

  get currentPlayer()   { return this.players[this.currentPlayerIdx] }
  get turn()            { return this.turnNumber }
  get activeUnitId()    { return this._activeUnitId }
  get pendingCount()    { return this._pendingIds.size }
  get validMoves()      { return this._validMoves as ReadonlySet<number> }

  // ── Combat configuration ───────────────────────────────────────────────────

  /**
   * Replace the RNG used for combat resolution.
   * Pass `() => constant` for deterministic tests or a seeded PRNG for
   * reproducible replays.  Defaults to Math.random.
   */
  setRand(fn: () => number): void { this._rand = fn }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Call once after wiring callbacks. */
  start(): void {
    this._beginTurn()
  }

  /** Cancel any in-flight AI timer so a scene rebuild won't receive stale callbacks. */
  stop(): void {
    if (this._aiTimeout !== null) {
      clearTimeout(this._aiTimeout)
      this._aiTimeout = null
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  serialize(): SavedGameState {
    return {
      turnNumber:       this.turnNumber,
      currentPlayerIdx: this.currentPlayerIdx,
      activeUnitId:     this._activeUnitId,
      pendingIds:       [...this._pendingIds],
      unitPaths:        [...this._unitPaths.entries()].map(([uid, path]) => ({
        uid,
        path: path.map(p => ({ x: p.x, y: p.y })),
      })),
    }
  }

  /**
   * Restore internal state from a saved snapshot.
   * Must be called BEFORE resumeAfterLoad() and AFTER callbacks (game.cb) are wired.
   * The tile/unit SABs must already contain the saved byte data.
   */
  restoreState(state: SavedGameState): void {
    this.turnNumber       = state.turnNumber
    this.currentPlayerIdx = state.currentPlayerIdx
    this._activeUnitId    = state.activeUnitId
    this._pendingIds      = new Set(state.pendingIds)
    this._unitPaths       = new Map(
      state.unitPaths.map(({ uid, path }) => [uid, path.map(p => ({ x: p.x, y: p.y }))])
    )
  }

  /**
   * Fire all UI callbacks to match the restored state.
   * Call once after restoreState() — equivalent to game.start() for a fresh game.
   */
  resumeAfterLoad(): void {
    const player = this.currentPlayer
    this.cb.onTurnStart(player, this.turnNumber, this._pendingIds.size)

    if (!player.isHuman) {
      // Unlikely to save mid-AI-turn, but handle it gracefully
      this._runAITurn()
      return
    }

    const uid = this._activeUnitId
    this._validMoves = this._computeValidMoves(uid)
    this.cb.onActiveUnitChanged(uid)
    this.cb.onValidMovesChanged(this._validMoves)
    this.cb.onPathChanged(uid >= 0 ? (this._unitPaths.get(uid) ?? []) : [])

    if (this._pendingIds.size === 0) {
      this.cb.onAllUnitsDone()
    }
  }

  /**
   * Human requests to move the active unit toward (toX, toY).
   *
   * • Adjacent tile (within _validMoves): moves immediately, cancels any
   *   previously stored path.
   * • Far tile: computes an A* path, executes the first step, and stores
   *   the remaining waypoints — they are auto-executed in future turns.
   *
   * Returns true if a step was taken.
   */
  requestMoveTo(toX: number, toY: number): boolean {
    if (this._activeUnitId < 0 || !this.currentPlayer.isHuman) return false

    const uid = this._activeUnitId
    const off = uid * UNIT_STRIDE
    const ux  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const uy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    if (ux === toX && uy === toY) return false

    // Spent unit — redefine the stored path without consuming a move this turn.
    // The new path auto-executes on the unit's next turn as normal.
    if (this.unitBytes[off + UNIT_MOVES_OFF] === 0) {
      const path = this._findPath(ux, uy, toX, toY, uid)
      if (!path || path.length === 0) return false
      this._unitPaths.set(uid, path)
      this.cb.onPathChanged(path)
      return true
    }

    const tileKey = toY * this.mapWidth + toX

    if (this._validMoves.has(tileKey)) {
      // Adjacent — cancel any stored path and move immediately
      this._unitPaths.delete(uid)
      this._executeStep(uid, toX, toY)
      return true
    }

    // Far target — compute A* path, execute first step, store the rest
    const path = this._findPath(ux, uy, toX, toY, uid)
    if (!path || path.length === 0) return false

    if (path.length > 1) {
      this._unitPaths.set(uid, path.slice(1))
    } else {
      this._unitPaths.delete(uid)
    }

    this._executeStep(uid, path[0].x, path[0].y)
    return true
  }

  /**
   * Focus any own unit for inspection/movement (player clicked it on the map).
   *
   * Works for both pending units (still have moves) and spent units (already
   * moved this turn — lets the player see its stored route in pink).
   * The unit's stored path is NOT auto-executed so the player can inspect or
   * override it first.  Returns false for invalid or opponent-owned units.
   */
  focusUnit(uid: number): boolean {
    if (!this.currentPlayer.isHuman) return false
    if (uid < 0 || uid >= this.unitCount) return false
    if (this.unitBytes[uid * UNIT_STRIDE + UNIT_CIV_OFF] !== this.currentPlayer.id) return false
    this._setActiveUnit(uid, false)
    return true
  }

  /** Cycle focus to the next (+1) or previous (-1) pending unit without auto-executing its path. */
  cyclePendingUnit(dir: 1 | -1): void {
    if (!this.currentPlayer.isHuman) return
    const pending = [...this._pendingIds].sort((a, b) => a - b)
    if (pending.length === 0) return
    const cur = this._activeUnitId
    const idx = pending.indexOf(cur)
    const next = dir === 1
      ? (idx < 0 ? pending[0]                                 : pending[(idx + 1) % pending.length])
      : (idx < 0 ? pending[pending.length - 1]                : pending[(idx - 1 + pending.length) % pending.length])
    this._setActiveUnit(next, false)
  }

  /** Returns the stored movement waypoints for a unit (empty if none). */
  getUnitPath(uid: number): ReadonlyArray<{ x: number; y: number }> {
    return this._unitPaths.get(uid) ?? []
  }

  /**
   * Compute the path the active unit would take to reach (toX, toY) — pure
   * read, no state changes.  Used to render the right-button hover preview.
   * Returns the waypoint list (not including start) or null if unreachable.
   */
  previewPathTo(toX: number, toY: number): Array<{ x: number; y: number }> | null {
    if (this._activeUnitId < 0) return null
    const uid = this._activeUnitId
    const off = uid * UNIT_STRIDE
    const ux  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const uy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    if (ux === toX && uy === toY) return []
    return this._findPath(ux, uy, toX, toY, uid)
  }

  /**
   * Skip the active unit.
   *
   * • Pending unit (still has moves): cancels stored path, marks done, advances.
   * • Spent unit selected via focusUnit: just deselects and advances — stored
   *   path is preserved so it auto-executes next turn as usual.
   */
  skipActiveUnit(): void {
    if (this._activeUnitId < 0 || !this.currentPlayer.isHuman) return
    const uid = this._activeUnitId
    if (this._pendingIds.has(uid)) {
      this._unitPaths.delete(uid)
      this.unitBytes[uid * UNIT_STRIDE + UNIT_MOVES_OFF] = 0
      this._pendingIds.delete(uid)
    }
    this._advanceActiveUnit()
  }

  /** Skip ALL remaining pending units for the current human player. */
  skipAllPending(): void {
    if (!this.currentPlayer.isHuman) return
    for (const uid of this._pendingIds) {
      this.unitBytes[uid * UNIT_STRIDE + UNIT_MOVES_OFF] = 0
    }
    this._pendingIds.clear()
    this._setActiveUnit(-1)
    this.cb.onAllUnitsDone()
  }

  /** Human player manually ends their turn. */
  endTurn(): void {
    if (!this.currentPlayer.isHuman) return
    this._nextTurn()
  }

  // ── Game Builder ──────────────────────────────────────────────────────────

  /**
   * Spawn a new unit at (tx, ty) for the given civilization.
   * Used by the in-game map editor.  Returns the new unit's id, or -1 if the
   * buffer is full.
   */
  placeUnit(tx: number, ty: number, typeId: UnitTypeId, civId: number): number {
    if (this.unitCount >= MAX_UNITS) return -1
    const uid = this.unitCount
    const off = uid * UNIT_STRIDE
    this.unitView.setUint16(off + UNIT_X_OFF, tx, true)
    this.unitView.setUint16(off + UNIT_Y_OFF, ty, true)
    this.unitBytes[off + UNIT_TYPE_OFF]  = typeId
    this.unitBytes[off + UNIT_CIV_OFF]   = civId
    this.unitBytes[off + UNIT_HP_OFF]    = 100
    this.unitBytes[off + UNIT_MOVES_OFF] = 0
    this.unitCount++
    return uid
  }

  // ── Unit actions ──────────────────────────────────────────────────────────

  /**
   * Returns the actions currently available for unit `uid`.
   * Fortify is prepended for every unit that still has moves.
   * Unit-specific actions are appended when their canPerform predicate passes.
   */
  getAvailableActions(uid: number): ActionDef[] {
    if (uid < 0 || uid >= this.unitCount) return []
    const off      = uid * UNIT_STRIDE
    const typeId   = this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId
    const civId    = this.unitBytes[off + UNIT_CIV_OFF]
    const x        = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const y        = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    const movesLeft = this.unitBytes[off + UNIT_MOVES_OFF]

    const ctx: ActionContext = {
      tileBytes: this.tileBytes,
      mapWidth:  this.mapWidth,
      mapHeight: this.mapHeight,
      unit: { typeId, civId, x, y, movesLeft },
    }

    const result: ActionDef[] = []

    // Fortify is universal — available whenever the unit still has moves
    const fortify = ACTION_DEFS.get(ActionId.Fortify)!
    if (fortify.canPerform(ctx)) result.push(fortify)

    // Unit-specific actions declared on the UnitDef
    for (const actionId of (UNIT_MAP.get(typeId)?.actions ?? [])) {
      const def = ACTION_DEFS.get(actionId)
      if (def && def.canPerform(ctx)) result.push(def)
    }

    return result
  }

  /**
   * Execute `actionId` for unit `uid`.  Returns false if the action is not
   * available or the current player is not human.
   */
  performAction(uid: number, actionId: ActionId): boolean {
    if (!this.currentPlayer.isHuman) return false
    if (uid < 0 || uid >= this.unitCount) return false

    switch (actionId) {
      case ActionId.Fortify:
        // Fortify = skip this unit for the turn; mark it for fortification accumulation
        this._fortifiedUids.add(uid)
        if (uid === this._activeUnitId) this.skipActiveUnit()
        return true

      case ActionId.FoundCity: {
        const off   = uid * UNIT_STRIDE
        const tx    = this.unitView.getUint16(off + UNIT_X_OFF, true)
        const ty    = this.unitView.getUint16(off + UNIT_Y_OFF, true)
        const civId = this.unitBytes[off + UNIT_CIV_OFF]

        // Remove settler from pending/path tracking
        this._pendingIds.delete(uid)
        this._unitPaths.delete(uid)

        // Delete settler: civId = 0 means "removed" — skipped by all iteration code
        this.unitBytes[off + UNIT_CIV_OFF]   = 0
        this.unitBytes[off + UNIT_MOVES_OFF] = 0

        // Place city at same tile
        this.placeUnit(tx, ty, UnitTypeId.City, civId)

        // Build initial cultural border tiles (3×3 ring minus center, within map bounds)
        const cultureBorderTiles: number[] = []
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const bx = tx + dx, by = ty + dy
            if (bx >= 0 && bx < this.mapWidth && by >= 0 && by < this.mapHeight) {
              cultureBorderTiles.push(by * this.mapWidth + bx)
            }
          }
        }

        const cityId = `city-${tx}-${ty}` as CityId
        const newCity: City = {
          id:          cityId,
          name:        'City',
          ownerId:     civId,
          foundedTurn: this.turnNumber,
          x: tx, y: ty,
          population:  1,
          storedFood:  0,
          citizenAssignments: [
            { kind: 'specialist', specialistType: SpecialistType.Scientist },
          ],
          productionQueue:    [],
          builtBuildings:     [],
          greatPersonPool:    { points: 0, greatPeopleBorn: 0, sources: {} },
          health:             5,
          happiness:          5,
          storedCulture:      0,
          cultureBorderTiles,
        }
        useGameStore.getState().updateCity(`${tx},${ty}`, newCity)

        this.cb.onUnitsChanged(this.unitCount)
        this._advanceActiveUnit()
        return true
      }

      default:
        return false
    }
  }

  // ── Private: turn cycle ────────────────────────────────────────────────────

  private _beginTurn(): void {
    const player = this.currentPlayer
    this._pendingIds = new Set()

    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] !== player.id) continue
      const typeId   = this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId
      const movement = UNIT_MAP.get(typeId)?.movement ?? 1
      if (movement === 0) continue   // immovable units (cities) don't join the turn cycle
      this.unitBytes[off + UNIT_MOVES_OFF] = movement
      this._pendingIds.add(i)

      // Accumulate fortification turns for units that explicitly fortified last turn
      if (this._fortifiedUids.has(i)) {
        this._fortifyTurns.set(i, (this._fortifyTurns.get(i) ?? 0) + 1)
      }
      // Clear the "fortified this turn" flag for next turn's accounting
      this._fortifiedUids.delete(i)
    }

    this.cb.onTurnStart(player, this.turnNumber, this._pendingIds.size)

    if (player.isHuman) {
      const first = this._firstPendingAfter(-1)
      this._setActiveUnit(first)
    } else {
      this._runAITurn()
    }
  }

  private _nextTurn(): void {
    this._processCitiesForPlayer(this.currentPlayer.id)
    const wasLast = this.currentPlayerIdx === this.players.length - 1
    if (wasLast) this._advanceDiplomacy()
    this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length
    if (wasLast) this.turnNumber++
    this._setActiveUnit(-1)
    this._beginTurn()
  }

  private _advanceDiplomacy(): void {
    const gs        = useGameStore.getState()
    const playerIds = this.players.map(p => p.id)
    let   map       = advanceDiplomacyTurn(gs.diplomacy, playerIds)
    const events: DiplomacyEvent[] = []

    for (const p of this.players) {
      if (p.isHuman) continue
      const result = runAIDiplomacy(map, p, this.players, this.turnNumber)
      map = result.nextMap
      events.push(...result.events)
    }

    gs.setDiplomacy(map)
    events.forEach(e => gs.addDiplomacyEvent(e))
  }

  private _getTileYield(tx: number, ty: number): TileYield {
    if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) {
      return { food: 0, production: 0, commerce: 0 }
    }
    const base    = (ty * this.mapWidth + tx) * TILE_STRIDE
    const terrain = this.tileBytes[base + TILE_TERRAIN] as TerrainType
    const def     = TERRAIN_MAP.get(terrain)
    return def
      ? { food: def.food, production: def.production, commerce: def.commerce }
      : { food: 0, production: 0, commerce: 0 }
  }

  private _processCitiesForPlayer(playerId: number): void {
    const gs = useGameStore.getState()
    for (const [key, city] of gs.cities) {
      if (city.ownerId !== playerId) continue
      const centerTileYields = this._getTileYield(city.x, city.y)
      const workedTiles: WorkedTile[] = city.citizenAssignments
        .filter(a => a.kind === 'tile')
        .map(a => ({
          tileKey: a.tileKey,
          yields:  this._getTileYield(a.tileKey % this.mapWidth, Math.floor(a.tileKey / this.mapWidth)),
        }))
      const context: CityTurnContext = {
        centerTileYields,
        workedTiles,
        buildings:     city.builtBuildings.map(id => getBuildingDef(id)),
        commerceRates: gs.commerceRates,
        turn:          this.turnNumber,
      }
      gs.updateCity(key, processCityTurn(city, context))
    }
  }

  // ── Private: combat helpers ───────────────────────────────────────────────

  /** Returns the uid of the first live unit at (tx, ty), or -1. */
  private _unitAt(tx: number, ty: number): number {
    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue  // dead / removed
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (ux === tx && uy === ty) return i
    }
    return -1
  }

  /** Returns true if civA and civB are currently at war. */
  private _atWar(civA: number, civB: number): boolean {
    const diplomacy = useGameStore.getState().diplomacy
    if (!diplomacy) return false
    return getRelation(diplomacy, civA, civB).status === 'war'
  }

  /** Returns true if any City unit sits on tile (tx, ty). */
  private _isCityTile(tx: number, ty: number): boolean {
    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (ux === tx && uy === ty &&
          (this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId) === UnitTypeId.City) {
        return true
      }
    }
    return false
  }

  /**
   * Resolve combat when `uid` moves onto an enemy-occupied tile.
   * Handles HP application, unit removal / capture, and post-combat advancement.
   */
  private _doAttack(uid: number, defenderUid: number): void {
    const aOff = uid         * UNIT_STRIDE
    const dOff = defenderUid * UNIT_STRIDE

    const ax = this.unitView.getUint16(aOff + UNIT_X_OFF, true)
    const ay = this.unitView.getUint16(aOff + UNIT_Y_OFF, true)
    const dx = this.unitView.getUint16(dOff + UNIT_X_OFF, true)
    const dy = this.unitView.getUint16(dOff + UNIT_Y_OFF, true)

    const aTileOff = (ay * this.mapWidth + ax) * TILE_STRIDE
    const dTileOff = (dy * this.mapWidth + dx) * TILE_STRIDE

    const aTypeId = this.unitBytes[aOff + UNIT_TYPE_OFF] as UnitTypeId
    const dTypeId = this.unitBytes[dOff + UNIT_TYPE_OFF] as UnitTypeId
    const aDef    = UNIT_MAP.get(aTypeId)!
    const dDef    = UNIT_MAP.get(dTypeId)!

    // Non-combat units cannot initiate attacks
    if (aDef.cannotAttack) return

    const attacker: CombatantStats = {
      uid,
      baseStrength:   aDef.strength,
      currentHp:      this.unitBytes[aOff + UNIT_HP_OFF],
      category:       aDef.category ?? UnitCategory.Melee,
      civId:          this.unitBytes[aOff + UNIT_CIV_OFF],
      tileX: ax, tileY: ay,
      terrain:        this.tileBytes[aTileOff + TILE_TERRAIN] as TerrainType,
      feature:        this.tileBytes[aTileOff + TILE_FEATURE] as FeatureType,
      isInCity:       this._isCityTile(ax, ay),
      fortifyTurns:   0,   // attacker is moving — fortification is broken
      cannotAttack:   false,
      noTerrainBonus: aDef.noTerrainBonus ?? false,
      combatBonuses:  aDef.combatBonuses  ?? [],
    }

    const defender: CombatantStats = {
      uid:            defenderUid,
      baseStrength:   dDef.strength,
      currentHp:      this.unitBytes[dOff + UNIT_HP_OFF],
      category:       dDef.category ?? UnitCategory.Melee,
      civId:          this.unitBytes[dOff + UNIT_CIV_OFF],
      tileX: dx, tileY: dy,
      terrain:        this.tileBytes[dTileOff + TILE_TERRAIN] as TerrainType,
      feature:        this.tileBytes[dTileOff + TILE_FEATURE] as FeatureType,
      isInCity:       this._isCityTile(dx, dy),
      fortifyTurns:   this._fortifyTurns.get(defenderUid) ?? 0,
      cannotAttack:   dDef.cannotAttack ?? false,
      noTerrainBonus: dDef.noTerrainBonus ?? false,
      combatBonuses:  dDef.combatBonuses  ?? [],
    }

    const river  = crossesRiver(this.tileBytes, this.mapWidth, ax, ay, dx, dy)
    const result = resolveCombat(attacker, defender, river, this._rand)

    // Apply HP changes to both units
    this.unitBytes[aOff + UNIT_HP_OFF] = result.attackerHpFinal
    this.unitBytes[dOff + UNIT_HP_OFF] = result.defenderHpFinal

    if (result.defenderCaptured) {
      // Non-combat unit captured: transfer ownership to attacker's civ
      this.unitBytes[dOff + UNIT_CIV_OFF] = attacker.civId
      this._fortifyTurns.delete(defenderUid)
    } else if (!result.attackerWon) {
      // Attacker lost: remove attacker from game
      this.unitBytes[aOff + UNIT_CIV_OFF]   = 0
      this.unitBytes[aOff + UNIT_MOVES_OFF] = 0
      this._pendingIds.delete(uid)
      this._fortifyTurns.delete(uid)
      this._fortifiedUids.delete(uid)
    } else {
      // Attacker won: remove defender, attacker advances onto the tile
      this.unitBytes[dOff + UNIT_CIV_OFF]   = 0
      this.unitBytes[dOff + UNIT_MOVES_OFF] = 0
      this._fortifyTurns.delete(defenderUid)
      this._applyMove(uid, dx, dy)
      this.cb.onUnitMoved(uid, ax, ay, dx, dy)
    }

    // Attacking always breaks fortification
    this._fortifyTurns.delete(uid)
    this._fortifiedUids.delete(uid)

    this.cb.onCombat({
      attackerUid:     uid,
      defenderUid,
      attackerWon:     result.attackerWon,
      attackerHpFinal: result.attackerHpFinal,
      defenderHpFinal: result.defenderHpFinal,
      rounds:          result.rounds.length,
    })
    this.cb.onUnitsChanged(this.unitCount)

    if (result.attackerWon || result.defenderCaptured) {
      if (this.unitBytes[aOff + UNIT_MOVES_OFF] > 0) {
        this._setActiveUnit(uid, true)
      } else {
        this._pendingIds.delete(uid)
        this._advanceActiveUnit()
      }
    } else {
      // Attacker died — advance to next unit
      this._advanceActiveUnit()
    }
  }

  // ── Private: AI ───────────────────────────────────────────────────────────

  private _runAITurn(): void {
    for (const uid of [...this._pendingIds]) {
      this._moveRandom(uid)
    }
    this._aiTimeout = setTimeout(() => {
      this._aiTimeout = null
      this._nextTurn()
    }, 120)
  }

  private _moveRandom(uid: number): void {
    const off = uid * UNIT_STRIDE
    while (this.unitBytes[off + UNIT_MOVES_OFF] > 0) {
      const ux      = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy      = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      const unitCiv = this.unitBytes[off + UNIT_CIV_OFF]

      // If the unit has been removed (died in a counter-attack), stop
      if (unitCiv === 0) break

      // Prefer attacking adjacent enemies when at war
      let attacked = false
      for (const [ddx, ddy] of DIRS) {
        const tx = ux + ddx, ty = uy + ddy
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue
        const occ = this._unitAt(tx, ty)
        if (occ >= 0) {
          const occCiv = this.unitBytes[occ * UNIT_STRIDE + UNIT_CIV_OFF]
          if (occCiv !== 0 && occCiv !== unitCiv && this._atWar(unitCiv, occCiv)) {
            this._doAttack(uid, occ)
            attacked = true
            break
          }
        }
      }
      if (attacked) break  // _doAttack handles move consumption and advancement

      const dirs = _shuffleDirs()
      let moved  = false
      for (const [dx, dy] of dirs) {
        const tx = ux + dx
        const ty = uy + dy
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue
        if (!this._passable(uid, tx, ty)) continue
        this._fortifyTurns.delete(uid)
        this._applyMove(uid, tx, ty)
        this.cb.onUnitMoved(uid, ux, uy, tx, ty)
        moved = true
        break
      }
      if (!moved) this.unitBytes[off + UNIT_MOVES_OFF] = 0  // stuck — exhaust remaining moves
    }
    this._pendingIds.delete(uid)
  }

  // ── Private: human unit cycling ───────────────────────────────────────────

  private _advanceActiveUnit(): void {
    if (this._pendingIds.size === 0) {
      this._setActiveUnit(-1)
      this.cb.onAllUnitsDone()
    } else {
      const next = this._firstPendingAfter(this._activeUnitId)
      this._setActiveUnit(next)
    }
  }

  /**
   * Focus on a unit for the human player.
   *
   * If the unit has a stored movement path and moves remaining, it
   * auto-executes the next waypoint without requiring player input.
   * The recursion terminates once all path-units have moved and the first
   * unit without queued orders becomes active (or all units are done).
   */
  private _setActiveUnit(uid: number, autoExecutePath = true): void {
    this._activeUnitId = uid

    // Auto-execute stored path if one exists for this unit
    if (autoExecutePath && uid >= 0 && this.currentPlayer.isHuman) {
      const path = this._unitPaths.get(uid)
      if (path && path.length > 0 &&
          this.unitBytes[uid * UNIT_STRIDE + UNIT_MOVES_OFF] > 0) {
        const step = path.shift()!                              // consume next waypoint
        if (path.length === 0) this._unitPaths.delete(uid)

        if (this._passable(uid, step.x, step.y)) {
          this._executeStep(uid, step.x, step.y)
          return  // _executeStep → _advanceActiveUnit → next _setActiveUnit call
        }
        // Waypoint became impassable — clear the path and fall through
        this._unitPaths.delete(uid)
      }
    }

    this._validMoves = this._computeValidMoves(uid)
    this.cb.onActiveUnitChanged(uid)
    this.cb.onValidMovesChanged(this._validMoves)
    this.cb.onPathChanged(uid >= 0 ? (this._unitPaths.get(uid) ?? []) : [])
  }

  private _firstPendingAfter(currentId: number): number {
    let firstWrapped = -1
    for (const id of this._pendingIds) {
      if (id > currentId) return id
      if (firstWrapped < 0) firstWrapped = id
    }
    return firstWrapped
  }

  // ── Private: movement helpers ─────────────────────────────────────────────

  /** Commit one step, fire callbacks. If the unit has moves left it stays active; otherwise advance. */
  private _executeStep(uid: number, toX: number, toY: number): void {
    // If an enemy occupies the destination, trigger combat instead of movement
    const occupantUid = this._unitAt(toX, toY)
    if (occupantUid >= 0) {
      this._doAttack(uid, occupantUid)
      return
    }

    const off = uid * UNIT_STRIDE
    const fx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const fy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    // Moving breaks fortification
    this._fortifyTurns.delete(uid)
    this._fortifiedUids.delete(uid)
    this._applyMove(uid, toX, toY)
    this.cb.onUnitMoved(uid, fx, fy, toX, toY)
    if (this.unitBytes[off + UNIT_MOVES_OFF] > 0) {
      // More moves remain — re-focus so path auto-execution or manual input continues
      this._setActiveUnit(uid, true)
    } else {
      this._pendingIds.delete(uid)
      this._advanceActiveUnit()
    }
  }

  private _applyMove(uid: number, tx: number, ty: number): void {
    const off = uid * UNIT_STRIDE
    this.unitView.setUint16(off + UNIT_X_OFF, tx, true)
    this.unitView.setUint16(off + UNIT_Y_OFF, ty, true)
    if (this.unitBytes[off + UNIT_MOVES_OFF] > 0) this.unitBytes[off + UNIT_MOVES_OFF]--
  }

  private _computeValidMoves(uid: number): Set<number> {
    const result = new Set<number>()
    if (uid < 0) return result
    if (this.unitBytes[uid * UNIT_STRIDE + UNIT_MOVES_OFF] === 0) return result  // spent — no green overlays

    const off = uid * UNIT_STRIDE
    const ux  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const uy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const tx = ux + dx
        const ty = uy + dy
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue
        if (this._passable(uid, tx, ty)) {
          result.add(ty * this.mapWidth + tx)
        }
      }
    }
    return result
  }

  /**
   * Returns true if `uid` may move to (tx, ty).
   *
   * @param forPathfinding  When true, enemy-occupied tiles are treated as
   *   impassable so A* doesn't path *through* enemy units.  When false
   *   (normal move/valid-moves check), enemy tiles count as passable if
   *   the two civs are at war (they are "attackable").
   */
  private _passable(uid: number, tx: number, ty: number, forPathfinding = false): boolean {
    const uOff   = uid * UNIT_STRIDE
    const typeId = this.unitBytes[uOff + UNIT_TYPE_OFF] as UnitTypeId
    const naval  = UNIT_MAP.get(typeId)?.isNaval ?? false

    const tOff   = (ty * this.mapWidth + tx) * TILE_STRIDE
    const terr   = this.tileBytes[tOff + TILE_TERRAIN] as TerrainType

    if (naval) {
      if (terr !== TerrainType.Ocean && terr !== TerrainType.Coast) return false
    } else {
      if (terr === TerrainType.Ocean || terr === TerrainType.Coast || terr === TerrainType.Mountain) return false
    }

    // Check for an occupying unit
    const occupantUid = this._unitAt(tx, ty)
    if (occupantUid >= 0) {
      const unitCiv     = this.unitBytes[uid         * UNIT_STRIDE + UNIT_CIV_OFF]
      const occupantCiv = this.unitBytes[occupantUid * UNIT_STRIDE + UNIT_CIV_OFF]
      if (occupantCiv === unitCiv) return false           // friendly — always blocked
      if (forPathfinding)          return false           // can't path through enemies
      return this._atWar(unitCiv, occupantCiv)            // enemy: allowed only when at war
    }

    return true
  }

  /**
   * A* pathfinding from (fromX, fromY) to (toX, toY) for the given unit.
   *
   * Returns the sequence of tiles to step through (not including the start
   * tile, including the destination), or null if no path is found within the
   * search budget.
   *
   * Uses Chebyshev distance as the heuristic (8-directional movement, uniform
   * step cost).  The open-set is scanned linearly; for the map sizes and path
   * lengths in this game the O(n) scan is fast enough (< 1 ms).
   */
  private _findPath(
    fromX: number, fromY: number,
    toX:   number, toY:   number,
    uid:   number,
  ): Array<{ x: number; y: number }> | null {
    if (!this._passable(uid, toX, toY, false)) return null

    const W      = this.mapWidth
    const key    = (x: number, y: number) => y * W + x
    const heur   = (x: number, y: number) => Math.max(Math.abs(x - toX), Math.abs(y - toY))
    const BUDGET = (this.mapWidth + this.mapHeight) * 4   // generous but bounded

    const open   = new Map<number, ANode>()
    const closed = new Set<number>()

    open.set(key(fromX, fromY), {
      x: fromX, y: fromY, g: 0, f: heur(fromX, fromY), parent: null,
    })

    while (open.size > 0) {
      if (closed.size >= BUDGET) return null  // give up — too far or no path

      // Pop lowest-f node (linear scan; fast enough for this scale)
      let best: ANode | undefined
      for (const n of open.values()) {
        if (!best || n.f < best.f) best = n
      }
      if (!best) break

      open.delete(key(best.x, best.y))
      closed.add(key(best.x, best.y))

      if (best.x === toX && best.y === toY) {
        // Reconstruct path from goal back to start, excluding start
        const path: { x: number; y: number }[] = []
        let cur: ANode | null = best
        while (cur && (cur.x !== fromX || cur.y !== fromY)) {
          path.unshift({ x: cur.x, y: cur.y })
          cur = cur.parent
        }
        return path
      }

      for (const [dx, dy] of DIRS) {
        const nx = best.x + dx, ny = best.y + dy
        if (nx < 0 || nx >= this.mapWidth || ny < 0 || ny >= this.mapHeight) continue
        const nk = key(nx, ny)
        if (closed.has(nk)) continue
        if (!this._passable(uid, nx, ny, true)) continue
        const g = best.g + 1
        const existing = open.get(nk)
        if (!existing || g < existing.g) {
          open.set(nk, { x: nx, y: ny, g, f: g + heur(nx, ny), parent: best })
        }
      }
    }

    return null  // no path found
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIRS: [number, number][] = [
  [-1,-1],[-1, 0],[-1, 1],
  [ 0,-1],        [ 0, 1],
  [ 1,-1],[ 1, 0],[ 1, 1],
]

function _shuffleDirs(): [number, number][] {
  const d = [...DIRS]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}
