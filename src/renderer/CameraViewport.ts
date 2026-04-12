/**
 * Lightweight camera viewport built directly on PixiJS v8 Container.
 * No external dependency required — avoids the pixi-viewport/pixi.js v8 mismatch.
 *
 * Features:
 *  - Mouse-wheel zoom centred on cursor
 *  - Left-button drag to pan (right/middle also work)
 *  - Deceleration on pointer release
 *  - Hard clamping to world bounds and zoom range
 *  - `left/right/top/bottom` world-space edge getters (matches pixi-viewport API)
 *  - `toWorld(screenX, screenY)` coordinate transform
 *  - Emits 'moved' and 'zoomed' events (as EventEmitter via Container)
 */
import { Container } from 'pixi.js'

export class CameraViewport extends Container {
  screenWidth:  number
  screenHeight: number

  private readonly worldWidth:  number
  private readonly worldHeight: number
  private readonly minZoom:     number
  private readonly maxZoom:     number

  // Deceleration state
  private velX = 0
  private velY = 0
  private isDragging = false
  private dragLastX = 0
  private dragLastY = 0
  private readonly FRICTION = 0.90

  constructor(opts: {
    screenWidth:  number
    screenHeight: number
    worldWidth:   number
    worldHeight:  number
    minZoom:      number
    maxZoom:      number
    canvas:       HTMLCanvasElement
  }) {
    super()
    this.screenWidth  = opts.screenWidth
    this.screenHeight = opts.screenHeight
    this.worldWidth   = opts.worldWidth
    this.worldHeight  = opts.worldHeight
    this.minZoom      = opts.minZoom
    this.maxZoom      = opts.maxZoom

    this.scale.set(1)
    this._bindCanvas(opts.canvas)
  }

  // ── World-space edge getters (matches pixi-viewport API) ──────────────────
  get left():   number { return -this.x / this.scale.x }
  get right():  number { return (this.screenWidth  - this.x) / this.scale.x }
  get top():    number { return -this.y / this.scale.y }
  get bottom(): number { return (this.screenHeight - this.y) / this.scale.y }

  /** Convert screen (CSS) coordinates to world coordinates. */
  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.x) / this.scale.x,
      y: (screenY - this.y) / this.scale.y,
    }
  }

  /** Centre the viewport on a world-space point. */
  moveCenter(worldX: number, worldY: number): this {
    this.x = this.screenWidth  / 2 - worldX * this.scale.x
    this.y = this.screenHeight / 2 - worldY * this.scale.y
    this._clamp()
    return this
  }

  /** Move the viewport so `(worldLeft, worldTop)` is at the top-left corner. */
  moveCorner(worldLeft: number, worldTop: number): this {
    this.x = -worldLeft * this.scale.x
    this.y = -worldTop  * this.scale.y
    this._clamp()
    this.emit('moved')
    return this
  }

  /** Zoom in/out by `delta` (positive = zoom in). Clamps to min/maxZoom. */
  zoom(delta: number, emit = true): this {
    const newScale = Math.max(this.minZoom, Math.min(this.maxZoom, this.scale.x + delta))
    const pivot    = { x: this.screenWidth / 2, y: this.screenHeight / 2 }
    this._zoomAt(newScale, pivot.x, pivot.y)
    if (emit) this.emit('zoomed')
    return this
  }

  resize(w: number, h: number): this {
    this.screenWidth  = w
    this.screenHeight = h
    this._clamp()
    this.emit('moved')
    return this
  }

  /** Call from the PixiJS ticker for deceleration. */
  update(): void {
    if (this.isDragging) return
    if (Math.abs(this.velX) < 0.05 && Math.abs(this.velY) < 0.05) return
    this.x += this.velX
    this.y += this.velY
    this.velX *= this.FRICTION
    this.velY *= this.FRICTION
    this._clamp()
    this.emit('moved')
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _zoomAt(newScale: number, pivotX: number, pivotY: number): void {
    const ratio = newScale / this.scale.x
    this.x = pivotX - (pivotX - this.x) * ratio
    this.y = pivotY - (pivotY - this.y) * ratio
    this.scale.set(newScale)
    this._clamp()
  }

  private _clamp(): void {
    // Don't clamp if world fits inside screen (centre instead)
    const scaledW = this.worldWidth  * this.scale.x
    const scaledH = this.worldHeight * this.scale.y

    if (scaledW < this.screenWidth) {
      this.x = (this.screenWidth - scaledW) / 2
    } else {
      this.x = Math.max(this.screenWidth - scaledW, Math.min(0, this.x))
    }

    if (scaledH < this.screenHeight) {
      this.y = (this.screenHeight - scaledH) / 2
    } else {
      this.y = Math.max(this.screenHeight - scaledH, Math.min(0, this.y))
    }
  }

  private _bindCanvas(canvas: HTMLCanvasElement): void {
    // ── Wheel zoom ──────────────────────────────────────────────────────────
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const factor    = e.deltaY < 0 ? 1.12 : 0.90
      const rect      = canvas.getBoundingClientRect()
      const cssScaleX = canvas.width  / rect.width
      const cssScaleY = canvas.height / rect.height
      const pivotX    = (e.clientX - rect.left) * cssScaleX / (window.devicePixelRatio || 1)
      const pivotY    = (e.clientY - rect.top)  * cssScaleY / (window.devicePixelRatio || 1)
      const newScale  = Math.max(this.minZoom, Math.min(this.maxZoom, this.scale.x * factor))
      this._zoomAt(newScale, pivotX, pivotY)
      this.emit('zoomed')
    }, { passive: false })

    // ── Pointer drag ────────────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      // Left (0), middle (1), or right (2) button starts drag
      this.isDragging  = true
      this.dragLastX   = e.clientX
      this.dragLastY   = e.clientY
      this.velX = this.velY = 0
      canvas.setPointerCapture(e.pointerId)
    })

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return
      const dx = e.clientX - this.dragLastX
      const dy = e.clientY - this.dragLastY
      this.x += dx
      this.y += dy
      this.velX = dx * 0.6
      this.velY = dy * 0.6
      this.dragLastX = e.clientX
      this.dragLastY = e.clientY
      this._clamp()
      this.emit('moved')
    })

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (this.isDragging) {
        this.isDragging = false
        try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      }
    })

    canvas.addEventListener('pointercancel', (e: PointerEvent) => {
      this.isDragging = false
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    })

    canvas.addEventListener('contextmenu', e => e.preventDefault())
  }
}
