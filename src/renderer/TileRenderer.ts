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
  MAP_WIDTH, MAP_HEIGHT, TILE_SIZE,
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE, TILE_IMPROVEMENT,
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

  // key = tileIndex (y * MAP_WIDTH + x)
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

  // Tile data view
  private tiles: Uint8Array

  private currentRange: VisibleRange = { minX: 0, maxX: -1, minY: 0, maxY: -1 }

  constructor(
    private tf: TextureFactory,
    tileBuffer: SharedArrayBuffer,
    viewport: CameraViewport,
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
    const idx = tileY * MAP_WIDTH + tileX
    if (idx === this.hoveredTile) return
    this.hoveredTile = idx
    if (tileX >= 0 && tileX < MAP_WIDTH && tileY >= 0 && tileY < MAP_HEIGHT) {
      this.hoverSprite.position.set(tileX * TILE_SIZE, tileY * TILE_SIZE)
      this.hoverSprite.visible = true
    } else {
      this.hoverSprite.visible = false
    }
  }

  /** Set selected tile. Pass (-1, -1) to clear selection. */
  setSelected(tileX: number, tileY: number): void {
    if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) {
      this.selectedTile = -1
      this.selectSprite.visible = false
      return
    }
    const idx = tileY * MAP_WIDTH + tileX
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
      const tx = key % MAP_WIDTH
      const ty = Math.floor(key / MAP_WIDTH)
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
    if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return -1
    return this.tiles[(ty * MAP_WIDTH + tx) * TILE_STRIDE + TILE_TERRAIN] as TerrainType
  }

  getRawTile(tx: number, ty: number): { terrain: number; feature: number; resource: number; improvement: number } | null {
    if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return null
    const base = (ty * MAP_WIDTH + tx) * TILE_STRIDE
    return {
      terrain:     this.tiles[base + TILE_TERRAIN],
      feature:     this.tiles[base + TILE_FEATURE],
      resource:    this.tiles[base + TILE_RESOURCE],
      improvement: this.tiles[base + TILE_IMPROVEMENT],
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private update(viewport: CameraViewport): void {
    const newRange = this.calcRange(viewport)
    if (this.rangeEq(newRange, this.currentRange)) return

    // Release tiles that scrolled out of view
    for (const [idx, rec] of this.active) {
      const tx = idx % MAP_WIDTH
      const ty = Math.floor(idx / MAP_WIDTH)
      if (!this.inRange(tx, ty, newRange)) {
        this.release(rec)
        this.active.delete(idx)
      }
    }

    // Acquire tiles that are now in view
    for (let ty = newRange.minY; ty <= newRange.maxY; ty++) {
      for (let tx = newRange.minX; tx <= newRange.maxX; tx++) {
        const idx = ty * MAP_WIDTH + tx
        if (this.active.has(idx)) continue
        const rec = this.acquire(tx, ty)
        this.active.set(idx, rec)
      }
    }

    this.currentRange = newRange
  }

  private calcRange(viewport: CameraViewport): VisibleRange {
    return {
      minX: Math.max(0,            Math.floor(viewport.left  / TILE_SIZE) - PAD),
      maxX: Math.min(MAP_WIDTH  - 1, Math.ceil(viewport.right  / TILE_SIZE) + PAD),
      minY: Math.max(0,            Math.floor(viewport.top   / TILE_SIZE) - PAD),
      maxY: Math.min(MAP_HEIGHT - 1, Math.ceil(viewport.bottom / TILE_SIZE) + PAD),
    }
  }

  private rangeEq(a: VisibleRange, b: VisibleRange): boolean {
    return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY
  }

  private inRange(tx: number, ty: number, r: VisibleRange): boolean {
    return tx >= r.minX && tx <= r.maxX && ty >= r.minY && ty <= r.maxY
  }

  private acquire(tx: number, ty: number): TileRecord {
    const base = (ty * MAP_WIDTH + tx) * TILE_STRIDE
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

    return { terrain, feature, resource, improve }
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
