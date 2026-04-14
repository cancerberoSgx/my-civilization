/**
 * Core turn-based game logic.
 *
 * Owns direct views into the SharedArrayBuffers (unit + tile data).
 * Drives the turn cycle:
 *   Human turn  → auto-focuses units one by one; waits for right-click moves
 *                 and "End Turn" button.
 *   AI turn     → moves every unit randomly in one synchronous pass, then
 *                 auto-advances after a short visual delay.
 *
 * All state changes are communicated to the rest of the app via callback
 * functions set after construction — no circular imports.
 */
import {
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF, UNIT_CIV_OFF,
  UNIT_HP_OFF, UNIT_MOVES_OFF,
  TILE_STRIDE, TILE_TERRAIN,
} from '../shared/constants'
import { TerrainType, UnitTypeId } from '../shared/types'
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
}

// ── Game ──────────────────────────────────────────────────────────────────────

export class Game {
  readonly players:   Player[]
  readonly unitCount: number
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

  /**
   * Human requests to move the active unit to (tx, ty).
   * Returns true if the move was valid and applied.
   */
  requestMove(toX: number, toY: number): boolean {
    if (this._activeUnitId < 0 || !this.currentPlayer.isHuman) return false

    const tileKey = toY * this.mapWidth + toX
    if (!this._validMoves.has(tileKey)) return false

    const uid = this._activeUnitId
    const off = uid * UNIT_STRIDE
    const fx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const fy  = this.unitView.getUint16(off + UNIT_Y_OFF, true)

    this._applyMove(uid, toX, toY)
    this.cb.onUnitMoved(uid, fx, fy, toX, toY)

    this._pendingIds.delete(uid)
    this._advanceActiveUnit()
    return true
  }

  /** Skip the active unit without moving (still counts as "acted"). */
  skipActiveUnit(): void {
    if (this._activeUnitId < 0 || !this.currentPlayer.isHuman) return
    const uid = this._activeUnitId
    this.unitBytes[uid * UNIT_STRIDE + UNIT_MOVES_OFF] = 0
    this._pendingIds.delete(uid)
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
    // Advance to next player; increment global turn after last player
    const wasLast = this.currentPlayerIdx === this.players.length - 1
    this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.players.length
    if (wasLast) this.turnNumber++
    this._setActiveUnit(-1)
    this._beginTurn()
  }

  // ── Private: AI ───────────────────────────────────────────────────────────

  private _runAITurn(): void {
    // Move all units synchronously in one shot — no visual lag
    for (const uid of [...this._pendingIds]) {
      this._moveRandom(uid)
    }
    // Brief delay so the UI "AI is thinking…" flash is perceptible
    setTimeout(() => this._nextTurn(), 120)
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
    // No valid direction found — unit stays (still counts as acted)
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

  private _setActiveUnit(uid: number): void {
    this._activeUnitId = uid
    this._validMoves   = this._computeValidMoves(uid)
    this.cb.onActiveUnitChanged(uid)
    this.cb.onValidMovesChanged(this._validMoves)
  }

  private _firstPendingAfter(currentId: number): number {
    // Find the smallest id > currentId in pending set
    let firstWrapped = -1
    for (const id of this._pendingIds) {
      if (id > currentId) return id
      if (firstWrapped < 0) firstWrapped = id
    }
    return firstWrapped  // wrapped around
  }

  // ── Private: movement helpers ─────────────────────────────────────────────

  private _applyMove(uid: number, tx: number, ty: number): void {
    const off = uid * UNIT_STRIDE
    this.unitView.setUint16(off + UNIT_X_OFF, tx, true)
    this.unitView.setUint16(off + UNIT_Y_OFF, ty, true)
    this.unitBytes[off + UNIT_MOVES_OFF] = 0
  }

  private _computeValidMoves(uid: number): Set<number> {
    const result = new Set<number>()
    if (uid < 0) return result

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
