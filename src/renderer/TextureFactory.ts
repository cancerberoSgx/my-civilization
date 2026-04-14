/**
 * Creates and caches all game textures using PixiJS v8's generateTexture API.
 * Called once after the renderer is ready.
 */
import { Graphics, Rectangle, Container, type Renderer, type Texture } from 'pixi.js'
import { TILE_SIZE } from '../shared/constants'
import { TerrainType, FeatureType, ResourceType, ImprovementType } from '../shared/types'
import { TERRAIN_MAP }     from '../data/terrains'
import { RESOURCE_MAP }    from '../data/resources'
import { IMPROVEMENT_MAP } from '../data/improvements'

const TS   = TILE_SIZE
const RECT = new Rectangle(0, 0, TS, TS)

/** Render a Graphics (or Container) to a fixed-size Texture and dispose the source. */
function capture(renderer: Renderer, target: Graphics | Container, w = TS, h = TS): Texture {
  const tex = renderer.generateTexture({
    target,
    frame:      new Rectangle(0, 0, w, h),
    resolution: 1,
  })
  target.destroy({ children: true })
  return tex
}

export class TextureFactory {
  readonly terrain     = new Map<TerrainType,     Texture>()
  readonly feature     = new Map<FeatureType,     Texture>()
  readonly resource    = new Map<ResourceType,    Texture>()
  readonly improvement = new Map<ImprovementType, Texture>()
  readonly hover:      Texture
  readonly select:     Texture
  readonly validMove:  Texture   // green overlay for reachable tiles
  readonly activeUnit: Texture   // pulsing border for focused unit tile
  readonly pathStep:        Texture   // blue tint for intermediate path tiles
  readonly pathDest:        Texture   // gold highlight for path destination tile
  readonly pathPreview:     Texture   // pink tint for right-button hover preview (intermediate)
  readonly pathPreviewDest: Texture   // bright pink for right-button hover destination
  readonly river     = new Map<number, Texture>()  // key = RIVER bitmask (1-15)

  constructor(renderer: Renderer) {
    // ── Terrain (solid colour + subtle edge shading) ───────────────────────
    for (const def of TERRAIN_MAP.values()) {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill(def.color)
      // g.rect(0, 0, TS, 1).fill({ color: 0xffffff, alpha: 0.15 })
      // g.rect(0, 0, 1,  TS).fill({ color: 0xffffff, alpha: 0.10 })
      // g.rect(0, TS-1, TS, 1).fill({ color: 0x000000, alpha: 0.20 })
      // g.rect(TS-1, 0, 1, TS).fill({ color: 0x000000, alpha: 0.12 })
      this.terrain.set(def.id, capture(renderer, g))
    }

    // ── Feature overlays (transparent background) ─────────────────────────
    this.feature.set(FeatureType.None, this.blank(renderer))

    // Forest: three dark-green canopy blobs + trunks
    {
      const g = new Graphics()
      const trees: [number, number][] = [[14, 42], [32, 22], [50, 42]]
      for (const [cx, cy] of trees) {
        g.circle(cx, cy, 14).fill(0x1e6b35)
        g.circle(cx, cy, 10).fill(0x2d8a45)
        g.rect(cx - 2, cy + 9, 5, 12).fill(0x5c3d11)
      }
      this.feature.set(FeatureType.Forest, capture(renderer, g))
    }

    // Jungle: denser, darker canopy
    {
      const g = new Graphics()
      const pts: [number, number][] = [[10,44],[24,24],[38,44],[52,28],[32,52]]
      for (const [cx, cy] of pts) {
        g.circle(cx, cy, 13).fill(0x0b4a1e)
        g.circle(cx, cy,  9).fill(0x155c26)
      }
      this.feature.set(FeatureType.Jungle, capture(renderer, g))
    }

    // Floodplain: blue-teal wavy lines
    {
      const g = new Graphics()
      for (let row = 0; row < 4; row++) {
        const y0 = 10 + row * 13
        for (let i = 0; i < 7; i++) {
          const x0 = 4  + i * 8
          const x1 = 12 + i * 8
          const yOff = i % 2 === 0 ? 4 : -4
          g.moveTo(x0, y0).lineTo(x1, y0 + yOff)
            .stroke({ color: 0x4a90d9, width: 2, alpha: 0.75 })
        }
      }
      this.feature.set(FeatureType.Floodplain, capture(renderer, g))
    }

    // Oasis: blue pool + palm
    {
      const g = new Graphics()
      g.ellipse(32, 44, 18, 10).fill(0x2e86c1)
      g.ellipse(32, 44, 14,  7).fill(0x5dade2)
      g.rect(30, 14, 4, 28).fill(0x5c3d11)         // trunk
      g.ellipse(32, 14, 15, 7).fill(0x27ae60)       // fronds
      this.feature.set(FeatureType.Oasis, capture(renderer, g))
    }

    // ── Resource icons (small centred badge) ──────────────────────────────
    this.resource.set(ResourceType.None, this.blank(renderer))
    for (const def of RESOURCE_MAP.values()) {
      const g = new Graphics()
      g.circle(32, 32, 11).fill({ color: 0xffffff, alpha: 0.85 })
      g.circle(32, 32,  8).fill(def.color)
      this.resource.set(def.id, capture(renderer, g))
    }

    // ── Improvement overlays ──────────────────────────────────────────────
    this.improvement.set(ImprovementType.None, this.blank(renderer))

    for (const def of IMPROVEMENT_MAP.values()) {
      const col = def.color
      const g = new Graphics()

      if (def.id === ImprovementType.Farm) {
        // Ploughed-field grid
        for (let i = 1; i < 4; i++) {
          g.moveTo(i * 16, 4).lineTo(i * 16, 60)
            .stroke({ color: col, width: 1.5, alpha: 0.65 })
          g.moveTo(4, i * 16).lineTo(60, i * 16)
            .stroke({ color: col, width: 1.5, alpha: 0.65 })
        }

      } else if (def.id === ImprovementType.Mine) {
        // Vertical shaft + crossbar
        g.rect(29, 12, 6, 40).fill({ color: col, alpha: 0.75 })
        g.rect(14, 20, 36, 5).fill({ color: col, alpha: 0.75 })

      } else if (def.id === ImprovementType.Pasture) {
        // Fence posts and rails
        for (let i = 0; i < 4; i++) g.rect(8 + i * 16, 22, 4, 26).fill({ color: col, alpha: 0.75 })
        g.rect(8, 28, 48, 4).fill({ color: col, alpha: 0.75 })
        g.rect(8, 38, 48, 4).fill({ color: col, alpha: 0.75 })

      } else if (def.id === ImprovementType.FishingBoat) {
        // Simple sail + hull
        g.ellipse(32, 46, 22, 9).fill({ color: col, alpha: 0.85 })
        g.rect(30, 14, 4, 32).fill({ color: col, alpha: 0.85 })
        // sail triangle
        g.poly([34, 16, 54, 32, 34, 38]).fill({ color: 0xffffff, alpha: 0.6 })

      } else {
        // Generic square marker
        g.rect(18, 18, 28, 28).fill({ color: col, alpha: 0.7 })
      }

      this.improvement.set(def.id, capture(renderer, g))
    }

    // ── Selection / hover overlays ─────────────────────────────────────────
    {
      const g = new Graphics()
      g.rect(2, 2, TS - 4, TS - 4).stroke({ color: 0xffff00, width: 3 })
      this.select = capture(renderer, g)
    }
    {
      const g = new Graphics()
      g.rect(1, 1, TS - 2, TS - 2).stroke({ color: 0xffffff, width: 1.5, alpha: 0.55 })
      this.hover = capture(renderer, g)
    }

    // ── Valid-move overlay (green semi-transparent) ─────────────────────────
    {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill({ color: 0x44ff66, alpha: 0.22 })
      g.rect(2, 2, TS - 4, TS - 4).stroke({ color: 0x44ff66, width: 2, alpha: 0.75 })
      this.validMove = capture(renderer, g)
    }

    // ── Active-unit tile border (bright cyan, used under the unit badge) ────
    {
      const g = new Graphics()
      g.rect(1, 1, TS - 2, TS - 2).stroke({ color: 0x00eeff, width: 3 })
      this.activeUnit = capture(renderer, g)
    }

    // ── Path overlays ─────────────────────────────────────────────────────────
    // pathStep: subtle blue tint for intermediate tiles along a queued route
    {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill({ color: 0x4488ff, alpha: 0.18 })
      g.rect(3, 3, TS - 6, TS - 6).stroke({ color: 0x4488ff, width: 1.5, alpha: 0.65 })
      this.pathStep = capture(renderer, g)
    }
    // pathDest: bright gold frame for the queued destination tile
    {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill({ color: 0xffcc22, alpha: 0.28 })
      g.rect(2, 2, TS - 4, TS - 4).stroke({ color: 0xffcc22, width: 2.5, alpha: 0.92 })
      this.pathDest = capture(renderer, g)
    }

    // pathPreview / pathPreviewDest: pink variants shown while right-button is held
    {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill({ color: 0xff44aa, alpha: 0.20 })
      g.rect(3, 3, TS - 6, TS - 6).stroke({ color: 0xff44aa, width: 1.5, alpha: 0.72 })
      this.pathPreview = capture(renderer, g)
    }
    {
      const g = new Graphics()
      g.rect(0, 0, TS, TS).fill({ color: 0xff44aa, alpha: 0.38 })
      g.rect(2, 2, TS - 4, TS - 4).stroke({ color: 0xff44aa, width: 3.0, alpha: 0.96 })
      this.pathPreviewDest = capture(renderer, g)
    }

    // ── River flow textures (one per bitmask 1-15) ───────────────────────
    // Each texture draws centre-to-edge lines for every active river edge,
    // giving continuous visual flow across adjacent tiles.
    // Bit layout: RIVER_N=1, RIVER_E=2, RIVER_S=4, RIVER_W=8
    {
      const RC  = 0x3a85c7  // river blue
      const RLT = 0x6ab0e6  // lighter highlight
      const RW  = 5         // stroke width (pixels)
      const TS2 = TS / 2    // tile centre

      for (let mask = 1; mask <= 15; mask++) {
        const g   = new Graphics()
        const pts: [number, number][] = []
        if (mask & 1) pts.push([TS2,  0  ])  // N edge midpoint
        if (mask & 2) pts.push([TS,   TS2])  // E edge midpoint
        if (mask & 4) pts.push([TS2,  TS ])  // S edge midpoint
        if (mask & 8) pts.push([0,    TS2])  // W edge midpoint

        // Dark base: line from tile centre to each active edge
        for (const [ex, ey] of pts) {
          g.moveTo(TS2, TS2).lineTo(ex, ey)
           .stroke({ color: RC, width: RW, alpha: 0.90 })
        }
        // Lighter highlight on top
        for (const [ex, ey] of pts) {
          g.moveTo(TS2, TS2).lineTo(ex, ey)
           .stroke({ color: RLT, width: 2, alpha: 0.45 })
        }
        // Centre dot to cover junction gaps
        g.circle(TS2, TS2, RW / 2 + 0.5).fill({ color: RC, alpha: 0.90 })

        this.river.set(mask, capture(renderer, g))
      }
    }
  }

  private blank(renderer: Renderer): Texture {
    // Full TILE_SIZE so pooled sprites always start at scale 1
    const g = new Graphics()
    g.rect(0, 0, TS, TS).fill({ color: 0, alpha: 0 })
    return renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, TS, TS), resolution: 1 })
  }
}
