/**
 * Renders unit badges on top of the tile layers.
 * Only units inside the current viewport are shown.
 *
 * Animations:
 *   • Move  — slide from tile A to tile B (queued, handles multi-step)
 *   • Combat — attacker lunges toward defender (sin wave), then eases to final tile
 *   • Fade   — dying unit fades out before removal
 *
 * HP bars are drawn in hpBarLayer (a separate Container exposed to viewport)
 * and always updated alongside active sprites.
 */
import { Container, Sprite, Graphics } from 'pixi.js'
import type { CameraViewport } from "./CameraViewport"
import {
  TILE_SIZE,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF, UNIT_CIV_OFF, UNIT_HP_OFF, UNIT_MOVES_OFF,
} from '../shared/constants'
import { UnitTypeId } from '../shared/types'
import type { UnitTextureFactory } from './UnitTextureFactory'
import type { SelectedUnit } from '../shared/types'
import { UNIT_MAP } from '../data/units'

const SPRITE_SIZE   = TILE_SIZE
const ANIM_DURATION = 500   // ms per move step

// ── Animation types ───────────────────────────────────────────────────────────

interface MoveAnim {
  sprite:  Sprite
  fromX:   number
  fromY:   number
  toX:     number
  toY:     number
  t0:      number
  pending: Array<{ toX: number; toY: number }>
}

interface CombatAnim {
  sprite:   Sprite
  startX:   number
  startY:   number
  /** Destination after animation (defender's tile if attacker won, start if lost). */
  endX:     number
  endY:     number
  /** Max lunge displacement (40% toward defender). */
  peakDx:   number
  peakDy:   number
  t0:       number
  duration: number
}

interface FadeAnim {
  t0:       number
  duration: number
}

// ── HP bar constants ──────────────────────────────────────────────────────────

const BAR_W  = 44
const BAR_H  = 4
const BAR_OX = 10   // offset from tile left edge
const BAR_OY = 2    // offset from tile top edge

export class UnitRenderer {
  readonly layer      = new Container()
  readonly hpBarLayer = new Container()

  private unitCount = 0
  private unitView!: DataView
  private unitBytes!: Uint8Array

  /** unitId → Sprite (only for currently visible units) */
  private active = new Map<number, Sprite>()
  private pool:   Sprite[] = []

  private selectedId = -1
  private activeId   = -1

  // ── Animation maps ────────────────────────────────────────────────────────
  /** In-flight slide animations (normal movement). */
  private anims      = new Map<number, MoveAnim>()
  /** In-flight combat bounce animations. */
  private combatAnims = new Map<number, CombatAnim>()
  /** Fade-out animations for dying units. */
  private fadeAnims   = new Map<number, FadeAnim>()
  /** UIDs currently fading out — kept in `active` until fade completes. */
  private dying       = new Set<number>()

  // ── HP bar state ──────────────────────────────────────────────────────────
  private hpBars = new Map<number, Graphics>()
  private hpPool: Graphics[] = []

  // ── RAF ───────────────────────────────────────────────────────────────────
  private _rafId: number | null = null
  private _onRaf = (): void => {
    this._rafId = null
    this._tickMove()
    this._tickCombat()
    this._tickFade()
    const hasAnims = this.anims.size > 0 || this.combatAnims.size > 0 || this.fadeAnims.size > 0
    if (hasAnims) this._startRaf()
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
    // Move anims are cancelled but combat/fade anims must survive a setBuffers call
    this.anims.clear()
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
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (ux === tx && uy === ty) return i
    }
    return -1
  }

  getUnitInfo(id: number): SelectedUnit | null {
    if (!this.unitView || id < 0 || id >= this.unitCount) return null
    const off    = id * UNIT_STRIDE
    const tx     = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const ty     = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    const typeId = this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId
    const civ    = this.unitBytes[off + UNIT_CIV_OFF]
    const hp     = this.unitBytes[off + UNIT_HP_OFF]
    const moves  = this.unitBytes[off + UNIT_MOVES_OFF]
    const def    = UNIT_MAP.get(typeId)
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

  setActiveUnit(id: number): void {
    this.activeId = id
    this.refreshHighlights()
  }

  refreshUnit(id: number): void {
    const sprite = this.active.get(id)
    if (!sprite || !this.unitView) return
    const off = id * UNIT_STRIDE
    const tx  = this.unitView.getUint16(off + UNIT_X_OFF, true)
    const ty  = this.unitView.getUint16(off + UNIT_Y_OFF, true)
    sprite.position.set(tx * TILE_SIZE, ty * TILE_SIZE)
  }

  triggerUpdate(): void {
    this.update()
  }

  // ── Viewport-culled render update ─────────────────────────────────────────

  private update(): void {
    if (!this.unitView) return

    const vp   = this.viewport
    const minTX = Math.max(0,               Math.floor(vp.left   / TILE_SIZE) - 2)
    const maxTX = Math.min(this.mapWidth  - 1, Math.ceil(vp.right  / TILE_SIZE) + 2)
    const minTY = Math.max(0,               Math.floor(vp.top    / TILE_SIZE) - 2)
    const maxTY = Math.min(this.mapHeight - 1, Math.ceil(vp.bottom / TILE_SIZE) + 2)

    const toShow = new Set<number>()

    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue
      const tx = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const ty = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (tx < minTX || tx > maxTX || ty < minTY || ty > maxTY) continue
      toShow.add(i)
    }

    // Release units no longer visible (keep animated/dying sprites alive)
    for (const [id, sprite] of this.active) {
      if (!toShow.has(id)) {
        if (this.anims.has(id))       continue  // move animation owns sprite
        if (this.combatAnims.has(id)) continue  // combat animation owns sprite
        if (this.dying.has(id))       continue  // fade animation owns sprite
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
      const sprite = this._getPooledSprite(tex)
      sprite.position.set(tx * TILE_SIZE, ty * TILE_SIZE)
      sprite.width   = SPRITE_SIZE
      sprite.height  = SPRITE_SIZE
      sprite.visible = true
      sprite.alpha   = 1.0
      this._applyTint(id, sprite)
      this.active.set(id, sprite)
    }

    this._updateHpBars()
  }

  // ── Normal move animation ─────────────────────────────────────────────────

  animateMove(uid: number, fromTX: number, fromTY: number, toTX: number, toTY: number): void {
    const toX = toTX * TILE_SIZE
    const toY = toTY * TILE_SIZE

    const existing = this.anims.get(uid)
    if (existing) {
      existing.pending.push({ toX, toY })
      return
    }

    const sprite = this.active.get(uid)
    if (!sprite) return

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

  // ── Combat bounce animation ───────────────────────────────────────────────

  /**
   * Plays a 1-second attack animation on the attacker sprite.
   *
   * Phase 0–0.5 s: lunge 40% toward the defender and return (sin wave).
   * Phase 0.5–1 s: ease to the final resting position.
   *   • attackerWon || defenderCaptured  → final = defender's tile
   *   • attacker lost                    → final = attacker's own tile
   *
   * Call BEFORE animateDeath so the fade starts at the right position.
   */
  animateCombat(
    attackerUid:      number,
    fromTX:           number,
    fromTY:           number,
    defenderTX:       number,
    defenderTY:       number,
    attackerWon:      boolean,
    defenderCaptured: boolean,
    duration = 1000,
  ): void {
    const sprite = this.active.get(attackerUid)
    if (!sprite) return  // off-screen — update() will snap to final position

    // Cancel any conflicting move animation
    this.anims.delete(attackerUid)

    const startX = fromTX * TILE_SIZE
    const startY = fromTY * TILE_SIZE
    const advX   = defenderTX * TILE_SIZE
    const advY   = defenderTY * TILE_SIZE
    const endX   = (attackerWon || defenderCaptured) ? advX : startX
    const endY   = (attackerWon || defenderCaptured) ? advY : startY

    sprite.position.set(startX, startY)

    this.combatAnims.set(attackerUid, {
      sprite,
      startX,
      startY,
      endX,
      endY,
      peakDx: (advX - startX) * 0.4,
      peakDy: (advY - startY) * 0.4,
      t0: performance.now(),
      duration,
    })
    this._startRaf()
  }

  // ── Fade-out animation ────────────────────────────────────────────────────

  /**
   * Fades the unit sprite to transparent over `duration` ms, then recycles it.
   * The unit must still be in `active` when called (call from onCombat, before
   * onUnitsChanged removes it from the buffer).
   */
  animateDeath(uid: number, duration = 600): void {
    const sprite = this.active.get(uid)
    if (!sprite) return  // off-screen — just disappears

    this.dying.add(uid)
    this.fadeAnims.set(uid, { t0: performance.now(), duration })
    this._startRaf()
  }

  // ── RAF helpers ───────────────────────────────────────────────────────────

  private _startRaf(): void {
    if (this._rafId === null) this._rafId = requestAnimationFrame(this._onRaf)
  }

  private _tickMove(): void {
    const now = performance.now()
    for (const [uid, anim] of this.anims) {
      const t    = Math.min(1, (now - anim.t0) / ANIM_DURATION)
      const ease = 1 - Math.pow(1 - t, 3)   // cubic ease-out
      anim.sprite.x = anim.fromX + (anim.toX - anim.fromX) * ease
      anim.sprite.y = anim.fromY + (anim.toY - anim.fromY) * ease

      if (t >= 1) {
        if (anim.pending.length > 0) {
          const next = anim.pending.shift()!
          anim.fromX = anim.toX
          anim.fromY = anim.toY
          anim.toX   = next.toX
          anim.toY   = next.toY
          anim.t0    = now
        } else {
          anim.sprite.position.set(anim.toX, anim.toY)
          this.anims.delete(uid)
        }
      }
    }
  }

  private _tickCombat(): void {
    const now = performance.now()
    const SPLIT = 0.5   // fraction of duration spent on lunge phase

    for (const [uid, anim] of this.combatAnims) {
      const t = Math.min(1, (now - anim.t0) / anim.duration)

      if (t >= 1) {
        anim.sprite.position.set(anim.endX, anim.endY)
        this.combatAnims.delete(uid)
      } else if (t < SPLIT) {
        // Lunge phase: sin wave forward and back
        const phase  = t / SPLIT              // 0 → 1
        const factor = Math.sin(phase * Math.PI)  // 0 → 1 → 0
        anim.sprite.x = anim.startX + anim.peakDx * factor
        anim.sprite.y = anim.startY + anim.peakDy * factor
      } else {
        // Advance phase: ease from start to final resting tile
        const phase = (t - SPLIT) / (1 - SPLIT)   // 0 → 1
        const ease  = 1 - Math.pow(1 - phase, 3)  // cubic ease-out
        anim.sprite.x = anim.startX + (anim.endX - anim.startX) * ease
        anim.sprite.y = anim.startY + (anim.endY - anim.startY) * ease
      }
    }
  }

  private _tickFade(): void {
    const now = performance.now()
    for (const [uid, anim] of this.fadeAnims) {
      const t = Math.min(1, (now - anim.t0) / anim.duration)

      if (t >= 1) {
        // Recycle sprite
        const sprite = this.active.get(uid)
        if (sprite) {
          sprite.visible = false
          sprite.alpha   = 1.0
          this.pool.push(sprite)
          this.active.delete(uid)
        }
        // Recycle HP bar if still alive
        const bar = this.hpBars.get(uid)
        if (bar) {
          bar.visible = false
          bar.alpha   = 1.0
          this.hpPool.push(bar)
          this.hpBars.delete(uid)
        }
        this.dying.delete(uid)
        this.fadeAnims.delete(uid)
      } else {
        const sprite = this.active.get(uid)
        if (sprite) sprite.alpha = 1.0 - t
      }
    }
  }

  // ── HP bars ───────────────────────────────────────────────────────────────

  private _updateHpBars(): void {
    if (!this.unitView) return

    // Return all current bars to the pool
    for (const [, g] of this.hpBars) {
      g.visible = false
      this.hpPool.push(g)
    }
    this.hpBars.clear()

    for (const [id] of this.active) {
      if (this.dying.has(id)) continue

      const off = id * UNIT_STRIDE
      const hp  = this.unitBytes[off + UNIT_HP_OFF]

      if (!this._shouldShowHpBar(id, hp)) continue

      const tx = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const ty = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      const g  = this._getPooledBar()
      this._drawHpBar(g, tx * TILE_SIZE, ty * TILE_SIZE, hp)
      g.visible = true
      this.hpBars.set(id, g)
    }
  }

  private _shouldShowHpBar(id: number, hp: number): boolean {
    return hp < 100 || id === this.selectedId || id === this.activeId
  }

  private _drawHpBar(g: Graphics, worldX: number, worldY: number, hp: number): void {
    const bx = worldX + BAR_OX
    const by = worldY + BAR_OY
    g.clear()
    g.rect(bx, by, BAR_W, BAR_H).fill(0x111111)
    if (hp > 0) {
      const fillW = Math.max(1, Math.round(BAR_W * hp / 100))
      const color = hp >= 75 ? 0x44cc44 : hp >= 40 ? 0xddcc22 : 0xcc3333
      g.rect(bx, by, fillW, BAR_H).fill(color)
    }
  }

  private _getPooledBar(): Graphics {
    if (this.hpPool.length > 0) return this.hpPool.pop()!
    const g = new Graphics()
    this.hpBarLayer.addChild(g)
    return g
  }

  // ── Tint helpers ──────────────────────────────────────────────────────────

  private _applyTint(id: number, sprite: Sprite): void {
    if (id === this.activeId) {
      sprite.tint  = 0x88ffff
      sprite.alpha = 1.0
    } else if (id === this.selectedId) {
      sprite.tint  = 0xffff88
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
    this._updateHpBars()
  }

  private _getPooledSprite(tex: import('pixi.js').Texture): Sprite {
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
