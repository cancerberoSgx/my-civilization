/**
 * Returns unit textures.
 * - If the unit has a `sprite` frame name and the atlas is loaded, returns the
 *   atlas texture directly (no caching needed — PixiJS already caches it).
 * - Otherwise falls back to a procedurally generated civ-coloured letter badge.
 */
import { Graphics, Text, Container, Rectangle, type Renderer, type Texture } from 'pixi.js'
import { UNIT_MAP }    from '../data/units'
import { UnitTypeId }  from '../shared/types'
import { TILE_SIZE }   from '../shared/constants'

export class UnitTextureFactory {
  private badgeCache = new Map<string, Texture>()

  constructor(
    private renderer: Renderer,
    private civColors: number[],
    private atlasTextures: Record<string, Texture> = {},
  ) {}

  get(civId: number, unitTypeId: UnitTypeId): Texture {
    const def = UNIT_MAP.get(unitTypeId)
    if (def?.sprite) {
      const tex = this.atlasTextures[def.sprite]
      if (tex) return tex
    }
    // Fallback: civ-coloured letter badge
    const key = `${civId}_${unitTypeId}`
    return this.badgeCache.get(key) ?? this.buildBadge(civId, unitTypeId, key)
  }

  private buildBadge(civId: number, unitTypeId: UnitTypeId, key: string): Texture {
    const civColor = this.civColors[civId] ?? 0x888888
    const letter   = UNIT_MAP.get(unitTypeId)?.letter ?? '?'
    const S        = TILE_SIZE

    const container = new Container()

    const g = new Graphics()
    g.circle(S / 2, S / 2, S / 2 - 1).fill(0x000000)
    g.circle(S / 2, S / 2, S / 2 - 3).fill(civColor)
    g.arc(S / 2, S / 2, S / 2 - 5, -Math.PI * 0.8, -Math.PI * 0.2)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.45 })
    container.addChild(g)

    const label = new Text({
      text: letter,
      style: {
        fontSize:   Math.round(S * 0.4),
        fill:       0xffffff,
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        dropShadow: { color: 0x000000, distance: 1, blur: 0, alpha: 0.9 },
      },
    })
    label.anchor.set(0.5)
    label.position.set(S / 2, S / 2)
    container.addChild(label)

    const texture = this.renderer.generateTexture({
      target:     container,
      frame:      new Rectangle(0, 0, S, S),
      resolution: 1,
    })
    container.destroy({ children: true })

    this.badgeCache.set(key, texture)
    return texture
  }
}
