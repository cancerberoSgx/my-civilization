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
  TILE_STRIDE, TILE_TERRAIN,
  MAX_UNITS,
} from '../shared/constants'
import { TerrainType, UnitTypeId } from '../shared/types'
import type { SavedGameState } from '../shared/saveFormat'
import { UNIT_MAP } from '../data/units'

// ── Player definition ─────────────────────────────────────────────────────────

export interface Player {
  id: number        // matches UNIT_CIV_OFF value (1-based)
  name: string
  isHuman: boolean
  color: number     // 0xRRGGBB for UI display
}

/** Build a players array from config — player 1 is human, rest are AI. */
export function buildPlayers(numCivs: number, civColors: number[]): Player[] {
  return Array.from({ length: numCivs }, (_, i) => ({
    id:      i + 1,
    name:    i === 0 ? 'Player 1' : `AI ${i}`,
    isHuman: i === 0,
    color:   civColors[i + 1] ?? 0x888888,
  }))
}

// ── A* node (module-level to avoid per-call type redeclarations) ──────────────

interface ANode { x: number; y: number; g: number; f: number; parent: ANode | null }

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

  // ── Private: turn cycle ────────────────────────────────────────────────────

  private _beginTurn(): void {
    const player = this.currentPlayer
    this._pendingIds = new Set()

    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === player.id) {
        this.unitBytes[off + UNIT_MOVES_OFF] = 1
        this._pendingIds.add(i)
      }
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
    const wasLast = this.currentPlayerIdx === this.players.length - 1
    this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length
    if (wasLast) this.turnNumber++
    this._setActiveUnit(-1)
    this._beginTurn()
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
    const ux  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const uy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)

    const dirs = _shuffleDirs()
    for (const [dx, dy] of dirs) {
      const tx = ux + dx
      const ty = uy + dy
      if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue
      if (!this._passable(uid, tx, ty)) continue
      const fx = ux, fy = uy
      this._applyMove(uid, tx, ty)
      this._pendingIds.delete(uid)
      this.cb.onUnitMoved(uid, fx, fy, tx, ty)
      return
    }
    this.unitBytes[off + UNIT_MOVES_OFF] = 0
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

  /** Commit one step, fire callbacks, remove unit from pending, advance. */
  private _executeStep(uid: number, toX: number, toY: number): void {
    const off = uid * UNIT_STRIDE
    const fx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const fy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    this._applyMove(uid, toX, toY)
    this.cb.onUnitMoved(uid, fx, fy, toX, toY)
    this._pendingIds.delete(uid)
    this._advanceActiveUnit()
  }

  private _applyMove(uid: number, tx: number, ty: number): void {
    const off = uid * UNIT_STRIDE
    this.unitView.setUint16(off + UNIT_X_OFF, tx, true)
    this.unitView.setUint16(off + UNIT_Y_OFF, ty, true)
    this.unitBytes[off + UNIT_MOVES_OFF] = 0
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

  private _passable(uid: number, tx: number, ty: number): boolean {
    const uOff   = uid * UNIT_STRIDE
    const typeId = this.unitBytes[uOff + UNIT_TYPE_OFF] as UnitTypeId
    const naval  = UNIT_MAP.get(typeId)?.isNaval ?? false

    const tOff   = (ty * this.mapWidth + tx) * TILE_STRIDE
    const terr   = this.tileBytes[tOff + TILE_TERRAIN] as TerrainType

    if (naval) {
      return terr === TerrainType.Ocean || terr === TerrainType.Coast
    }
    return terr !== TerrainType.Ocean &&
           terr !== TerrainType.Coast &&
           terr !== TerrainType.Mountain
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
    if (!this._passable(uid, toX, toY)) return null

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
        if (!this._passable(uid, nx, ny)) continue
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
