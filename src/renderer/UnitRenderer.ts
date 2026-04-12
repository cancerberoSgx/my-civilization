/**
 * Renders unit badges on top of the tile layers.
 * Only units inside the current viewport are shown.
 */
import { Container, Sprite } from 'pixi.js'
import type { CameraViewport } from "./CameraViewport"
import {
  MAP_WIDTH, MAP_HEIGHT, TILE_SIZE,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF, UNIT_CIV_OFF, UNIT_HP_OFF, UNIT_MOVES_OFF,
  CIV_COLORS,
} from '../shared/constants'
import { UnitTypeId } from '../shared/types'
import type { UnitTextureFactory } from './UnitTextureFactory'
import type { SelectedUnit } from '../shared/types'
import { UNIT_MAP } from '../data/units'

const BADGE = 36
const BADGE_OFFSET = (TILE_SIZE - BADGE) / 2  // centre badge in tile

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

  constructor(
    private utf: UnitTextureFactory,
    private viewport: CameraViewport,
  ) {
    viewport.on('moved',  () => this.update())
    viewport.on('zoomed', () => this.update())
  }

  setBuffers(unitBuffer: SharedArrayBuffer, count: number): void {
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

  private update(): void {
    if (!this.unitView) return

    const vp = this.viewport
    const minTX = Math.max(0,          Math.floor(vp.left   / TILE_SIZE) - 2)
    const maxTX = Math.min(MAP_WIDTH  - 1, Math.ceil(vp.right  / TILE_SIZE) + 2)
    const minTY = Math.max(0,          Math.floor(vp.top    / TILE_SIZE) - 2)
    const maxTY = Math.min(MAP_HEIGHT - 1, Math.ceil(vp.bottom / TILE_SIZE) + 2)

    const toShow = new Set<number>()

    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      const tx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const ty  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (tx < minTX || tx > maxTX || ty < minTY || ty > maxTY) continue
      toShow.add(i)
    }

    // Release units no longer visible
    for (const [id, sprite] of this.active) {
      if (!toShow.has(id)) {
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
      sprite.position.set(tx * TILE_SIZE + BADGE_OFFSET, ty * TILE_SIZE + BADGE_OFFSET)
      sprite.width  = BADGE
      sprite.height = BADGE
      sprite.visible = true
      sprite.alpha   = id === this.selectedId ? 1.0 : 0.92
      // Yellow tint for selected
      sprite.tint    = id === this.selectedId ? 0xffff88 : 0xffffff
      this.active.set(id, sprite)
    }
  }

  private refreshHighlights(): void {
    for (const [id, sprite] of this.active) {
      sprite.tint  = id === this.selectedId ? 0xffff88 : 0xffffff
      sprite.alpha = id === this.selectedId ? 1.0 : 0.92
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
