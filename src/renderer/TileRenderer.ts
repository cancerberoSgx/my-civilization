/**
 * Viewport-culled tile renderer.
 *
 * Only the tiles visible on screen (+ a small buffer) are alive as PixiJS
 * Sprite objects.  As the camera pans, out-of-view tiles are released back
 * to pools and new tiles are acquired from those pools.
 *
 * Layers (bottom → top):
 *   terrainLayer  – one Sprite per visible tile
 *   featureLayer  – forest / jungle / oasis overlays
 *   resourceLayer – resource icon badges
 *   improveLayer  – improvement overlays
 *   highlightLayer– hover / selection frames
 *   moveLayer     – valid-move green overlays (game turn logic)
 *   activeLayer   – cyan border on the currently active unit's tile
 */
import { Container, Sprite, type Texture } from 'pixi.js'
import type { CameraViewport } from './CameraViewport'
import {
  TILE_SIZE,
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE, TILE_IMPROVEMENT, TILE_RIVER,
} from '../shared/constants'
import { TerrainType, FeatureType, ResourceType, ImprovementType } from '../shared/types'
import type { TextureFactory } from './TextureFactory'

interface VisibleRange { minX: number; maxX: number; minY: number; maxY: number }

// One pooled record per visible tile – reused across pan events
interface TileRecord {
  terrain:  Sprite
  feature:  Sprite
  resource: Sprite
  improve:  Sprite
}

// Spare tile buffer (all layers stacked)
const PAD = 3  // extra tiles around the visible area

export class TileRenderer {
  // layer containers added to viewport
  readonly terrainLayer   = new Container()
  readonly featureLayer   = new Container()
  readonly resourceLayer  = new Container()
  readonly improveLayer   = new Container()
  /** Added ABOVE unit layer so it renders on top */
  readonly highlightLayer = new Container()
  /** Valid-move green overlays — sits between improve and unit layers */
  readonly moveLayer      = new Container()
  /** Queued movement path — sits between moveLayer and unit layer */
  readonly pathLayer      = new Container()
  /** River edge overlays — sits between terrain and feature layers */
  readonly riverLayer     = new Container()

  // key = tileIndex (y * mapWidth + x)
  private active = new Map<number, TileRecord>()

  // Sprite pools (one pool per layer; all sprites start off-stage)
  private terrainPool:  Sprite[] = []
  private featurePool:  Sprite[] = []
  private resourcePool: Sprite[] = []
  private improvePool:  Sprite[] = []

  // Selection / hover
  private hoverSprite:  Sprite
  private selectSprite: Sprite
  private selectedTile = -1
  private hoveredTile  = -1

  // Valid-move overlays (pool + active list)
  private moveSprites:       Sprite[] = []
  private activeMoveSprites: Sprite[] = []
  // Active-unit tile highlight (single sprite)
  private activeUnitSprite:  Sprite

  // River sprites — one composite sprite per tile (pooled)
  private riverPool:    Sprite[] = []
  private activeRivers = new Map<number, Sprite>()

  // Path sprites — intermediate tiles + single destination sprite
  private pathPool:          Sprite[] = []
  private activePathSprites: Sprite[] = []
  private destSprite:        Sprite

  // Path preview sprites (right-button held) — pink, independent from committed path
  private previewPool:          Sprite[] = []
  private activePreviewSprites: Sprite[] = []
  private previewDestSprite:    Sprite

  // Tile data view
  private tiles: Uint8Array

  private currentRange: VisibleRange = { minX: 0, maxX: -1, minY: 0, maxY: -1 }

  constructor(
    private tf: TextureFactory,
    tileBuffer: SharedArrayBuffer,
    viewport: CameraViewport,
    private mapWidth: number,
    private mapHeight: number,
  ) {
    this.tiles = new Uint8Array(tileBuffer)

    // Hover / select overlays live in highlightLayer
    this.hoverSprite  = new Sprite(tf.hover)
    this.selectSprite = new Sprite(tf.select)
    this.hoverSprite.visible  = false
    this.selectSprite.visible = false
    this.highlightLayer.addChild(this.hoverSprite, this.selectSprite)

    // Active-unit border (cyan, shows whose turn it is)
    this.activeUnitSprite = new Sprite(tf.activeUnit)
    this.activeUnitSprite.width   = TILE_SIZE
    this.activeUnitSprite.height  = TILE_SIZE
    this.activeUnitSprite.visible = false
    this.moveLayer.addChild(this.activeUnitSprite)

    // Destination sprite for queued movement path
    this.destSprite = new Sprite(tf.pathDest)
    this.destSprite.width   = TILE_SIZE
    this.destSprite.height  = TILE_SIZE
    this.destSprite.visible = false
    this.pathLayer.addChild(this.destSprite)

    // Destination sprite for right-button preview path
    this.previewDestSprite = new Sprite(tf.pathPreviewDest)
    this.previewDestSprite.width   = TILE_SIZE
    this.previewDestSprite.height  = TILE_SIZE
    this.previewDestSprite.visible = false
    this.pathLayer.addChild(this.previewDestSprite)

    // Wire viewport events
    viewport.on('moved',  () => this.update(viewport))
    viewport.on('zoomed', () => this.update(viewport))
  }

  /** Call once after adding layers to the viewport. */
  initialUpdate(viewport: CameraViewport): void {
    this.update(viewport)
  }

  /** Set hovered tile (call from pointer-move handler). */
  setHover(tileX: number, tileY: number): void {
    const idx = tileY * this.mapWidth + tileX
    if (idx === this.hoveredTile) return
    this.hoveredTile = idx
    if (tileX >= 0 && tileX < this.mapWidth && tileY >= 0 && tileY < this.mapHeight) {
      this.hoverSprite.position.set(tileX * TILE_SIZE, tileY * TILE_SIZE)
      this.hoverSprite.visible = true
    } else {
      this.hoverSprite.visible = false
    }
  }

  /** Set selected tile. Pass (-1, -1) to clear selection. */
  setSelected(tileX: number, tileY: number): void {
    if (tileX < 0 || tileY < 0 || tileX >= this.mapWidth || tileY >= this.mapHeight) {
      this.selectedTile = -1
      this.selectSprite.visible = false
      return
    }
    const idx = tileY * this.mapWidth + tileX
    if (idx === this.selectedTile) {
      // Second click on same tile → deselect
      this.selectedTile = -1
      this.selectSprite.visible = false
      return
    }
    this.selectedTile = idx
    this.selectSprite.position.set(tileX * TILE_SIZE, tileY * TILE_SIZE)
    this.selectSprite.visible = true
  }

  /**
   * Show green overlays on all valid move destinations.
   * Pass an empty set to clear them.
   */
  setValidMoves(moves: ReadonlySet<number>): void {
    // Recycle active sprites back to pool
    for (const s of this.activeMoveSprites) {
      s.visible = false
      this.moveSprites.push(s)
    }
    this.activeMoveSprites = []

    for (const key of moves) {
      const tx = key % this.mapWidth
      const ty = Math.floor(key / this.mapWidth)
      const s  = this._getMoveSprite()
      s.position.set(tx * TILE_SIZE, ty * TILE_SIZE)
      s.visible = true
      this.activeMoveSprites.push(s)
    }
  }

  /** Highlight the tile of the currently active (focused) unit. */
  setActiveUnitTile(tileX: number, tileY: number): void {
    if (tileX < 0 || tileY < 0) {
      this.activeUnitSprite.visible = false
      return
    }
    this.activeUnitSprite.position.set(tileX * TILE_SIZE, tileY * TILE_SIZE)
    this.activeUnitSprite.visible = true
  }

  /** Returns terrain type at tile, or -1 if out of range. */
  getTerrainAt(tx: number, ty: number): TerrainType | -1 {
    if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) return -1
    return this.tiles[(ty * this.mapWidth + tx) * TILE_STRIDE + TILE_TERRAIN] as TerrainType
  }

  getRawTile(tx: number, ty: number): { terrain: number; feature: number; resource: number; improvement: number } | null {
    if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) return null
    const base = (ty * this.mapWidth + tx) * TILE_STRIDE
    return {
      terrain:     this.tiles[base + TILE_TERRAIN],
      feature:     this.tiles[base + TILE_FEATURE],
      resource:    this.tiles[base + TILE_RESOURCE],
      improvement: this.tiles[base + TILE_IMPROVEMENT],
    }
  }

  /**
   * Draw a queued movement path on the map.
   * tiles[0..n-2] get a blue intermediate overlay; tiles[n-1] gets the gold
   * destination frame.  Pass an empty array to clear.
   */
  setPath(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    // Return intermediate sprites to pool
    for (const s of this.activePathSprites) {
      s.visible = false
      this.pathPool.push(s)
    }
    this.activePathSprites = []

    if (tiles.length === 0) {
      this.destSprite.visible = false
      return
    }

    // Intermediate tiles
    for (let i = 0; i < tiles.length - 1; i++) {
      const { x, y } = tiles[i]
      const s = this._getPathStepSprite()
      s.position.set(x * TILE_SIZE, y * TILE_SIZE)
      s.visible = true
      this.activePathSprites.push(s)
    }

    // Destination tile
    const dest = tiles[tiles.length - 1]
    this.destSprite.position.set(dest.x * TILE_SIZE, dest.y * TILE_SIZE)
    this.destSprite.visible = true
  }

  private _getPathStepSprite(): Sprite {
    if (this.pathPool.length > 0) {
      return this.pathPool.pop()!
    }
    const s = new Sprite(this.tf.pathStep)
    s.width  = TILE_SIZE
    s.height = TILE_SIZE
    this.pathLayer.addChild(s)
    return s
  }

  /**
   * Show a pink path preview while the right mouse button is held.
   * Clears automatically when called with an empty array.
   */
  setPathPreview(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    for (const s of this.activePreviewSprites) {
      s.visible = false
      this.previewPool.push(s)
    }
    this.activePreviewSprites = []

    if (tiles.length === 0) {
      this.previewDestSprite.visible = false
      return
    }

    for (let i = 0; i < tiles.length - 1; i++) {
      const { x, y } = tiles[i]
      const s = this._getPreviewSprite()
      s.position.set(x * TILE_SIZE, y * TILE_SIZE)
      s.visible = true
      this.activePreviewSprites.push(s)
    }

    const dest = tiles[tiles.length - 1]
    this.previewDestSprite.position.set(dest.x * TILE_SIZE, dest.y * TILE_SIZE)
    this.previewDestSprite.visible = true
  }

  private _getPreviewSprite(): Sprite {
    if (this.previewPool.length > 0) {
      return this.previewPool.pop()!
    }
    const s = new Sprite(this.tf.pathPreview)
    s.width  = TILE_SIZE
    s.height = TILE_SIZE
    this.pathLayer.addChild(s)
    return s
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private update(viewport: CameraViewport): void {
    const newRange = this.calcRange(viewport)
    if (this.rangeEq(newRange, this.currentRange)) return

    // Release tiles that scrolled out of view
    for (const [idx, rec] of this.active) {
      const tx = idx % this.mapWidth
      const ty = Math.floor(idx / this.mapWidth)
      if (!this.inRange(tx, ty, newRange)) {
        this.release(rec)
        const rs = this.activeRivers.get(idx)
        if (rs) { rs.visible = false; this.riverPool.push(rs); this.activeRivers.delete(idx) }
        this.active.delete(idx)
      }
    }

    // Acquire tiles that are now in view
    for (let ty = newRange.minY; ty <= newRange.maxY; ty++) {
      for (let tx = newRange.minX; tx <= newRange.maxX; tx++) {
        const idx = ty * this.mapWidth + tx
        if (this.active.has(idx)) continue
        const rec = this.acquire(tx, ty)
        this.active.set(idx, rec)
      }
    }

    this.currentRange = newRange
  }

  private calcRange(viewport: CameraViewport): VisibleRange {
    return {
      minX: Math.max(0,                Math.floor(viewport.left   / TILE_SIZE) - PAD),
      maxX: Math.min(this.mapWidth  - 1, Math.ceil(viewport.right  / TILE_SIZE) + PAD),
      minY: Math.max(0,                Math.floor(viewport.top    / TILE_SIZE) - PAD),
      maxY: Math.min(this.mapHeight - 1, Math.ceil(viewport.bottom / TILE_SIZE) + PAD),
    }
  }

  private rangeEq(a: VisibleRange, b: VisibleRange): boolean {
    return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY
  }

  private inRange(tx: number, ty: number, r: VisibleRange): boolean {
    return tx >= r.minX && tx <= r.maxX && ty >= r.minY && ty <= r.maxY
  }

  private acquire(tx: number, ty: number): TileRecord {
    const base = (ty * this.mapWidth + tx) * TILE_STRIDE
    const terrainId  = this.tiles[base + TILE_TERRAIN]    as TerrainType
    const featureId  = this.tiles[base + TILE_FEATURE]    as FeatureType
    const resourceId = this.tiles[base + TILE_RESOURCE]   as ResourceType
    const improveId  = this.tiles[base + TILE_IMPROVEMENT] as ImprovementType

    const wx = tx * TILE_SIZE
    const wy = ty * TILE_SIZE

    const terrain  = this.getPooled(this.terrainPool,  this.terrainLayer,  this.tf.terrain.get(terrainId)!)
    const feature  = this.getPooled(this.featurePool,  this.featureLayer,  this.tf.feature.get(featureId) ?? this.tf.feature.get(FeatureType.None)!)
    const resource = this.getPooled(this.resourcePool, this.resourceLayer, this.tf.resource.get(resourceId) ?? this.tf.resource.get(ResourceType.None)!)
    const improve  = this.getPooled(this.improvePool,  this.improveLayer,  this.tf.improvement.get(improveId) ?? this.tf.improvement.get(ImprovementType.None)!)

    terrain.position.set(wx, wy)
    feature.position.set(wx, wy)
    resource.position.set(wx, wy)
    improve.position.set(wx, wy)

    terrain.visible  = true
    feature.visible  = featureId !== FeatureType.None
    resource.visible = resourceId !== ResourceType.None
    improve.visible  = improveId !== ImprovementType.None

    // River sprite — one composite per tile (bitmask → texture lookup)
    const riverBits = this.tiles[base + TILE_RIVER]
    if (riverBits) {
      const tex = this.tf.river.get(riverBits)
      if (tex) {
        this.activeRivers.set(ty * this.mapWidth + tx, this.getPooledRiver(tex, wx, wy))
      }
    }

    return { terrain, feature, resource, improve }
  }

  private getPooledRiver(texture: Texture, wx: number, wy: number): Sprite {
    let s: Sprite
    if (this.riverPool.length > 0) {
      s = this.riverPool.pop()!
      s.texture = texture
    } else {
      s = new Sprite(texture)
      s.width  = TILE_SIZE
      s.height = TILE_SIZE
      this.riverLayer.addChild(s)
    }
    s.position.set(wx, wy)
    s.visible = true
    return s
  }

  private release(rec: TileRecord): void {
    rec.terrain.visible  = false
    rec.feature.visible  = false
    rec.resource.visible = false
    rec.improve.visible  = false
    this.terrainPool.push(rec.terrain)
    this.featurePool.push(rec.feature)
    this.resourcePool.push(rec.resource)
    this.improvePool.push(rec.improve)
  }

  private getPooled(pool: Sprite[], layer: Container, texture: Texture): Sprite {
    let s: Sprite
    if (pool.length > 0) {
      s = pool.pop()!
      s.texture = texture
    } else {
      s = new Sprite(texture)
      layer.addChild(s)
    }
    // Always reset size — texture swap can change natural dimensions
    s.width  = TILE_SIZE
    s.height = TILE_SIZE
    return s
  }

  private _getMoveSprite(): Sprite {
    if (this.moveSprites.length > 0) {
      return this.moveSprites.pop()!
    }
    const s = new Sprite(this.tf.validMove)
    s.width  = TILE_SIZE
    s.height = TILE_SIZE
    this.moveLayer.addChild(s)
    return s
  }
}
