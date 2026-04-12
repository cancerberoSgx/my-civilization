/**
 * Creates unit badge textures: a coloured circle with a letter.
 * Uses renderer.generateTexture() — the PixiJS v8 off-screen render API.
 */
import { Graphics, Text, Container, Rectangle, type Renderer, type Texture } from 'pixi.js'
import { CIV_COLORS } from '../shared/constants'
import { UNIT_MAP }    from '../data/units'
import { UnitTypeId }  from '../shared/types'

const BADGE = 36  // badge size in pixels

export class UnitTextureFactory {
  private cache = new Map<string, Texture>()

  constructor(private renderer: Renderer) {}

  get(civId: number, unitTypeId: UnitTypeId): Texture {
    const key = `${civId}_${unitTypeId}`
    if (this.cache.has(key)) return this.cache.get(key)!
    return this.build(civId, unitTypeId, key)
  }

  private build(civId: number, unitTypeId: UnitTypeId, key: string): Texture {
    const civColor = CIV_COLORS[civId] ?? 0x888888
    const letter   = UNIT_MAP.get(unitTypeId)?.letter ?? '?'

    const container = new Container()

    // Circle badge
    const g = new Graphics()
    g.circle(BADGE / 2, BADGE / 2, BADGE / 2 - 1).fill(0x000000)
    g.circle(BADGE / 2, BADGE / 2, BADGE / 2 - 3).fill(civColor)
    // Highlight arc (top)
    g.arc(BADGE / 2, BADGE / 2, BADGE / 2 - 5, -Math.PI * 0.8, -Math.PI * 0.2)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.45 })
    container.addChild(g)

    // Unit letter
    const label = new Text({
      text: letter,
      style: {
        fontSize:   16,
        fill:       0xffffff,
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontWeight: 'bold',
        dropShadow: { color: 0x000000, distance: 1, blur: 0, alpha: 0.9 },
      },
    })
    label.anchor.set(0.5)
    label.position.set(BADGE / 2, BADGE / 2)
    container.addChild(label)

    const texture = this.renderer.generateTexture({
      target:     container,
      frame:      new Rectangle(0, 0, BADGE, BADGE),
      resolution: 1,
    })
    container.destroy({ children: true })

    this.cache.set(key, texture)
    return texture
  }
}
