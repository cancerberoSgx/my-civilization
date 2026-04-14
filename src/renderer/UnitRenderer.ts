/**
 * Renders unit badges on top of the tile layers.
 * Only units inside the current viewport are shown.
 */
import { Container, Sprite } from 'pixi.js'
import type { CameraViewport } from "./CameraViewport"
import {
  TILE_SIZE,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF, UNIT_CIV_OFF, UNIT_HP_OFF, UNIT_MOVES_OFF,
} from '../shared/constants'
import { UnitTypeId } from '../shared/types'
import type { UnitTextureFactory } from './UnitTextureFactory'
import type { SelectedUnit } from '../shared/types'
import { UNIT_MAP } from '../data/units'

const SPRITE_SIZE    = TILE_SIZE
const ANIM_DURATION  = 500   // ms per move step

interface Anim {
  sprite:  Sprite
  fromX:   number   // world-pixel start of current step
  fromY:   number
  toX:     number   // world-pixel end of current step
  toY:     number
  t0:      number   // performance.now() at step start
  /** Steps queued behind the current one (multi-move units) */
  pending: Array<{ toX: number; toY: number }>
}

export class UnitRenderer {
  readonly layer = new Container()

  private unitCount = 0
  private unitView!: DataView
  private unitBytes!: Uint8Array

  /** unitId → Sprite (only for currently visible units) */
  private active = new Map<number, Sprite>()
  private pool: Sprite[] = []

  /** Currently selected unit id (-1 if none) */
  private selectedId = -1
  /** Currently active (game-focused) unit id (-1 if none) */
  private activeId   = -1

  /** In-flight move animations keyed by unit id */
  private anims = new Map<number, Anim>()
  private _rafId: number | null = null
  private _onRaf = (): void => {
    this._rafId = null
    this._tickAnims()
    if (this.anims.size > 0) this._startRaf()
  }

  constructor(
    private utf: UnitTextureFactory,
    private viewport: CameraViewport,
    private mapWidth: number,
    private mapHeight: number,
  ) {
    viewport.on('moved',  () => this.update())
    viewport.on('zoomed', () => this.update())
  }

  setBuffers(unitBuffer: SharedArrayBuffer, count: number): void {
    this.anims.clear()   // cancel any in-flight animations
    this.unitView  = new DataView(unitBuffer)
    this.unitBytes = new Uint8Array(unitBuffer)
    this.unitCount = count
    this.update()
  }

  /** Returns unit id at tile (tx,ty) or -1 */
  unitAt(tx: number, ty: number): number {
    if (!this.unitView) return -1
    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue   // deleted unit
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (ux === tx && uy === ty) return i
    }
    return -1
  }

  getUnitInfo(id: number): SelectedUnit | null {
    if (!this.unitView || id < 0 || id >= this.unitCount) return null
    const off     = id * UNIT_STRIDE
    const tx      = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const ty      = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    const typeId  = this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId
    const civ     = this.unitBytes[off + UNIT_CIV_OFF]
    const hp      = this.unitBytes[off + UNIT_HP_OFF]
    const moves   = this.unitBytes[off + UNIT_MOVES_OFF]
    const def     = UNIT_MAP.get(typeId)
    return {
      id,
      name:      def?.name ?? 'Unknown',
      civ,
      hp,
      movesLeft: moves,
      x:         tx,
      y:         ty,
      strength:  def?.strength ?? 0,
    }
  }

  selectUnit(id: number): void {
    this.selectedId = id
    this.refreshHighlights()
  }

  /** Mark the game-focused (active turn) unit. Pass -1 to clear. */
  setActiveUnit(id: number): void {
    this.activeId = id
    this.refreshHighlights()
  }

  /**
   * Reposition one unit's sprite after it moved.
   * O(1) — just updates the existing sprite if it's currently visible.
   * Units that move off-screen are cleaned up on the next viewport event.
   */
  refreshUnit(id: number): void {
    const sprite = this.active.get(id)
    if (!sprite || !this.unitView) return
    const off = id * UNIT_STRIDE
    const tx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const ty  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    sprite.position.set(tx * TILE_SIZE, ty * TILE_SIZE)
  }

  /** Force a full viewport cull + re-acquire cycle (used after AI turn). */
  triggerUpdate(): void {
    this.update()
  }

  private update(): void {
    if (!this.unitView) return

    const vp = this.viewport
    const minTX = Math.max(0,          Math.floor(vp.left   / TILE_SIZE) - 2)
    const maxTX = Math.min(this.mapWidth  - 1, Math.ceil(vp.right  / TILE_SIZE) + 2)
    const minTY = Math.max(0,                  Math.floor(vp.top    / TILE_SIZE) - 2)
    const maxTY = Math.min(this.mapHeight - 1, Math.ceil(vp.bottom / TILE_SIZE) + 2)

    const toShow = new Set<number>()

    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue   // deleted unit
      const tx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const ty  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (tx < minTX || tx > maxTX || ty < minTY || ty > maxTY) continue
      toShow.add(i)
    }

    // Release units no longer visible (keep animating sprites alive)
    for (const [id, sprite] of this.active) {
      if (!toShow.has(id)) {
        if (this.anims.has(id)) continue   // animation owns this sprite until it finishes
        sprite.visible = false
        this.pool.push(sprite)
        this.active.delete(id)
      }
    }

    // Activate newly visible units
    for (const id of toShow) {
      if (this.active.has(id)) continue
      const off    = id * UNIT_STRIDE
      const tx     = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const ty     = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      const typeId = this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId
      const civId  = this.unitBytes[off + UNIT_CIV_OFF]

      const tex    = this.utf.get(civId, typeId)
      const sprite = this.getPooled(tex)
      sprite.position.set(tx * TILE_SIZE, ty * TILE_SIZE)
      sprite.width  = SPRITE_SIZE
      sprite.height = SPRITE_SIZE
      sprite.visible = true
      this._applyTint(id, sprite)
      this.active.set(id, sprite)
    }
  }

  /**
   * Slide unit `uid` from tile (fromTX, fromTY) to (toTX, toTY) over ANIM_DURATION ms.
   * Multiple calls for the same unit while it is already animating are queued and
   * play back-to-back (handles multi-move units like Knights or Galleys).
   * Off-screen units are skipped — they snap to position when scrolled into view.
   */
  animateMove(uid: number, fromTX: number, fromTY: number, toTX: number, toTY: number): void {
    const toX = toTX * TILE_SIZE
    const toY = toTY * TILE_SIZE

    const existing = this.anims.get(uid)
    if (existing) {
      existing.pending.push({ toX, toY })
      return
    }

    const sprite = this.active.get(uid)
    if (!sprite) return   // off-screen — update() will place it at destination when visible

    sprite.position.set(fromTX * TILE_SIZE, fromTY * TILE_SIZE)
    this.anims.set(uid, {
      sprite,
      fromX: fromTX * TILE_SIZE,
      fromY: fromTY * TILE_SIZE,
      toX,
      toY,
      t0:      performance.now(),
      pending: [],
    })
    this._startRaf()
  }

  private _startRaf(): void {
    if (this._rafId === null) this._rafId = requestAnimationFrame(this._onRaf)
  }

  private _tickAnims(): void {
    const now = performance.now()
    for (const [uid, anim] of this.anims) {
      const t    = Math.min(1, (now - anim.t0) / ANIM_DURATION)
      const ease = 1 - Math.pow(1 - t, 3)   // cubic ease-out
      anim.sprite.x = anim.fromX + (anim.toX - anim.fromX) * ease
      anim.sprite.y = anim.fromY + (anim.toY - anim.fromY) * ease

      if (t >= 1) {
        if (anim.pending.length > 0) {
          const next  = anim.pending.shift()!
          anim.fromX  = anim.toX
          anim.fromY  = anim.toY
          anim.toX    = next.toX
          anim.toY    = next.toY
          anim.t0     = now
        } else {
          anim.sprite.position.set(anim.toX, anim.toY)
          this.anims.delete(uid)
        }
      }
    }
  }

  private _applyTint(id: number, sprite: Sprite): void {
    if (id === this.activeId) {
      sprite.tint  = 0x88ffff   // cyan — game-focused unit
      sprite.alpha = 1.0
    } else if (id === this.selectedId) {
      sprite.tint  = 0xffff88   // yellow — click-selected
      sprite.alpha = 1.0
    } else {
      sprite.tint  = 0xffffff
      sprite.alpha = 0.92
    }
  }

  private refreshHighlights(): void {
    for (const [id, sprite] of this.active) {
      this._applyTint(id, sprite)
    }
  }

  private getPooled(tex: import('pixi.js').Texture): Sprite {
    if (this.pool.length > 0) {
      const s = this.pool.pop()!
      s.texture = tex
      return s
    }
    const s = new Sprite(tex)
    this.layer.addChild(s)
    return s
  }
}
