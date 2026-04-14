/**
 * Map generation worker.
 * Receives SharedArrayBuffers, fills them with terrain + unit data, then posts 'done'.
 */
import {
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE,
  TILE_IMPROVEMENT, TILE_OWNER, TILE_VISIBILITY, TILE_RIVER,
  RIVER_N, RIVER_E, RIVER_S, RIVER_W,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF, UNIT_TYPE_OFF,
  UNIT_CIV_OFF, UNIT_HP_OFF, UNIT_MOVES_OFF,
  MAX_UNITS,
} from '../shared/constants'
import {
  TerrainType, FeatureType, ResourceType, ImprovementType, UnitTypeId,
} from '../shared/types'
import type { MapgenRequest } from '../shared/types'

// ── Seeded PRNG (LCG) ────────────────────────────────────────────────────────
class RNG {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 || 1 }
  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 15), 0x2c1b3c6d)
    this.s = Math.imul(this.s ^ (this.s >>> 12), 0x297a2d39)
    this.s ^= this.s >>> 15
    return (this.s >>> 0) / 0x100000000
  }
  int(max: number): number { return Math.floor(this.next() * max) }
}

// ── Value noise ───────────────────────────────────────────────────────────────
function hash2(x: number, y: number, s: number): number {
  const n = x * 127.1 + y * 311.7 + s * 74.9
  return Math.abs(Math.sin(n) * 43758.5453123) % 1
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const c00 = hash2(xi,     yi,     seed)
  const c10 = hash2(xi + 1, yi,     seed)
  const c01 = hash2(xi,     yi + 1, seed)
  const c11 = hash2(xi + 1, yi + 1, seed)
  return c00*(1-u)*(1-v) + c10*u*(1-v) + c01*(1-u)*v + c11*u*v
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let val = 0, amp = 1, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq, seed + i * 1000) * amp
    max += amp
    amp  *= 0.5
    freq *= 2.1
  }
  return val / max
}

// ── River flow directions: [dx, dy, bit on current tile, bit on neighbour] ───
const DIRS4: [number, number, number, number][] = [
  [ 0, -1, RIVER_N, RIVER_S],
  [ 1,  0, RIVER_E, RIVER_W],
  [ 0,  1, RIVER_S, RIVER_N],
  [-1,  0, RIVER_W, RIVER_E],
]

// ── Main handler ──────────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<MapgenRequest>) => {
  const { tileBuffer, unitBuffer, unitCountBuffer, mapWidth, mapHeight, numCivs, seed } = e.data

  const tiles     = new Uint8Array(tileBuffer)
  const units     = new Uint8Array(unitBuffer)
  const unitCount = new Int32Array(unitCountBuffer)
  const unitView  = new DataView(unitBuffer)

  const rng = new RNG(seed)

  // ── 1. Generate terrain ─────────────────────────────────────────────────────
  // Also store the raw elevation for later river-tracing.
  const elevMap = new Float32Array(mapWidth * mapHeight)

  for (let ty = 0; ty < mapHeight; ty++) {
    const ny = ty / mapHeight
    for (let tx = 0; tx < mapWidth; tx++) {
      const nx = tx / mapWidth

      const elev    = fbm(nx * 4.0, ny * 4.0, 6, seed)
      const moist   = fbm(nx * 3.0 + 100, ny * 3.0 + 100, 4, seed + 999)
      const featureN = fbm(nx * 8.0, ny * 8.0, 3, seed + 12345)
      const lat     = Math.abs(ny - 0.5) * 2  // 0=equator → 1=poles

      elevMap[ty * mapWidth + tx] = elev

      let terrain: TerrainType
      let feature     = FeatureType.None
      let resource    = ResourceType.None
      let improvement = ImprovementType.None

      // ── Terrain by elevation ──
      if (elev < 0.28) {
        terrain = TerrainType.Ocean
      } else if (elev < 0.38) {
        terrain = TerrainType.Coast
      } else if (elev > 0.88) {
        terrain = TerrainType.Mountain
      } else if (elev > 0.72) {
        terrain = TerrainType.Hill
      } else if (lat > 0.85) {
        terrain = TerrainType.Snow
      } else if (lat > 0.72) {
        terrain = TerrainType.Tundra
      } else if (moist < 0.30) {
        terrain = TerrainType.Desert
      } else if (moist < 0.50) {
        terrain = TerrainType.Plains
      } else {
        terrain = TerrainType.Grassland
      }

      // ── Features ──
      if (
        terrain !== TerrainType.Ocean &&
        terrain !== TerrainType.Coast &&
        terrain !== TerrainType.Mountain &&
        terrain !== TerrainType.Snow
      ) {
        if (featureN > 0.62) {
          if (terrain === TerrainType.Grassland || terrain === TerrainType.Plains) {
            feature = lat < 0.25 ? FeatureType.Jungle : FeatureType.Forest
          } else if (terrain === TerrainType.Tundra) {
            feature = FeatureType.Forest
          }
        }
        if (terrain === TerrainType.Desert && featureN > 0.82) {
          feature = FeatureType.Oasis
        }
        if (terrain === TerrainType.Grassland && moist > 0.72 && lat < 0.15 && featureN > 0.74) {
          feature = FeatureType.Floodplain
        }
      }

      // ── Resources (~8% of tiles) ──
      const rr = hash2(tx, ty, seed + 777)
      if (rr < 0.08) {
        const r2 = hash2(tx, ty, seed + 888)
        if (terrain === TerrainType.Ocean || terrain === TerrainType.Coast) {
          resource = ResourceType.Fish
        } else if (terrain === TerrainType.Hill || terrain === TerrainType.Mountain) {
          resource = r2 < 0.35 ? ResourceType.Iron
                   : r2 < 0.55 ? ResourceType.Gold
                   : r2 < 0.75 ? ResourceType.Copper
                   : ResourceType.Coal
        } else if (terrain === TerrainType.Desert) {
          resource = r2 < 0.5 ? ResourceType.Gold : ResourceType.Copper
        } else if (terrain === TerrainType.Plains || terrain === TerrainType.Grassland || terrain === TerrainType.Tundra) {
          resource = r2 < 0.25 ? ResourceType.Wheat
                   : r2 < 0.45 ? ResourceType.Cow
                   : r2 < 0.60 ? ResourceType.Horse
                   : r2 < 0.75 ? ResourceType.Stone
                   : ResourceType.Corn
        }
      }

      // ── Improvements (40% of resource tiles) ──
      if (resource !== ResourceType.None && hash2(tx, ty, seed + 1234) < 0.4) {
        if (resource === ResourceType.Wheat || resource === ResourceType.Corn) {
          improvement = ImprovementType.Farm
        } else if (resource === ResourceType.Cow || resource === ResourceType.Horse) {
          improvement = ImprovementType.Pasture
        } else if (
          resource === ResourceType.Iron  || resource === ResourceType.Gold   ||
          resource === ResourceType.Copper|| resource === ResourceType.Coal   ||
          resource === ResourceType.Stone
        ) {
          improvement = ImprovementType.Mine
        } else if (resource === ResourceType.Fish) {
          improvement = ImprovementType.FishingBoat
        }
      }

      const idx = (ty * mapWidth + tx) * TILE_STRIDE
      tiles[idx + TILE_TERRAIN]     = terrain
      tiles[idx + TILE_FEATURE]     = feature
      tiles[idx + TILE_RESOURCE]    = resource
      tiles[idx + TILE_IMPROVEMENT] = improvement
      tiles[idx + TILE_OWNER]       = 0
      tiles[idx + TILE_VISIBILITY]  = 2  // fully visible for demo
      tiles[idx + TILE_RIVER]       = 0  // filled in river pass below
    }

    if (ty % 50 === 0) {
      self.postMessage({ type: 'progress', pct: Math.round((ty / mapHeight) * 70) })
    }
  }

  // ── 2. Generate rivers ───────────────────────────────────────────────────────
  // Divide the map into sectors and start one river per sector that contains
  // a mountain or hill, ensuring uniform coverage across the whole map.
  // Each river traces the steepest downhill path; when all unvisited neighbours
  // are exhausted (inland basin), it falls back to the lowest overall neighbour
  // so it can escape and always reach ocean/coast.

  const SECTOR        = 50                    // tiles per sector side
  const MAX_RIVER_LEN = mapWidth + mapHeight  // enough to cross the entire map
  const sectorsX      = Math.ceil(mapWidth  / SECTOR)
  const sectorsY      = Math.ceil(mapHeight / SECTOR)

  for (let sry = 0; sry < sectorsY; sry++) {
    for (let srx = 0; srx < sectorsX; srx++) {
      const x0 = srx * SECTOR,                      y0 = sry * SECTOR
      const x1 = Math.min(x0 + SECTOR, mapWidth),   y1 = Math.min(y0 + SECTOR, mapHeight)

      // Find a mountain or hill source inside this sector
      let sx = -1, sy = -1
      for (let a = 0; a < 500 && sx < 0; a++) {
        const tx = x0 + rng.int(x1 - x0)
        const ty = y0 + rng.int(y1 - y0)
        const t  = tiles[(ty * mapWidth + tx) * TILE_STRIDE + TILE_TERRAIN] as TerrainType
        if (t === TerrainType.Mountain || t === TerrainType.Hill) { sx = tx; sy = ty }
      }
      if (sx < 0) continue  // no elevated source in this sector

      const visited = new Set<number>()
      let cx = sx, cy = sy

      for (let step = 0; step < MAX_RIVER_LEN; step++) {
        const cKey     = cy * mapWidth + cx
        visited.add(cKey)
        const cTerrain = tiles[cKey * TILE_STRIDE + TILE_TERRAIN] as TerrainType
        if (cTerrain === TerrainType.Ocean || cTerrain === TerrainType.Coast) break

        // Primary: lowest-elevation unvisited neighbour (avoids backtracking)
        let bestElev = Infinity, bestNx = -1, bestNy = -1, bestOut = 0, bestIn = 0
        for (const [dx, dy, rOut, rIn] of DIRS4) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
          if (visited.has(ny * mapWidth + nx)) continue
          const elev = elevMap[ny * mapWidth + nx]
          if (elev < bestElev) { bestElev = elev; bestNx = nx; bestNy = ny; bestOut = rOut; bestIn = rIn }
        }

        // Fallback: surrounded by visited tiles — allow revisit to escape basins
        if (bestNx < 0) {
          for (const [dx, dy, rOut, rIn] of DIRS4) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
            const elev = elevMap[ny * mapWidth + nx]
            if (elev < bestElev) { bestElev = elev; bestNx = nx; bestNy = ny; bestOut = rOut; bestIn = rIn }
          }
        }

        if (bestNx < 0) break  // at map edge — no neighbours at all

        // Mark the shared edge on both tiles
        tiles[cKey * TILE_STRIDE + TILE_RIVER]                         = (tiles[cKey * TILE_STRIDE + TILE_RIVER] | bestOut) & 0xFF
        tiles[(bestNy * mapWidth + bestNx) * TILE_STRIDE + TILE_RIVER] = (tiles[(bestNy * mapWidth + bestNx) * TILE_STRIDE + TILE_RIVER] | bestIn) & 0xFF

        cx = bestNx; cy = bestNy
      }
    }
  }

  self.postMessage({ type: 'progress', pct: 85 })

  // ── 3. Place starting units ─────────────────────────────────────────────────
  // Each civ starts with exactly: Settler, Worker, Scout, Warrior
  // All 4 units are placed in a 3×3 cluster around a random land starting tile.

  const startingUnits: UnitTypeId[] = [
    UnitTypeId.Settler,
    UnitTypeId.Worker,
    UnitTypeId.Scout,
    UnitTypeId.Warrior,
  ]

  function isLandStart(terrain: TerrainType): boolean {
    return terrain !== TerrainType.Ocean &&
           terrain !== TerrainType.Coast &&
           terrain !== TerrainType.Mountain
  }

  let total = 0

  for (let civ = 1; civ <= numCivs && total < MAX_UNITS; civ++) {
    // Find a valid land starting tile (up to 10 000 attempts)
    let sx = -1, sy = -1
    for (let a = 0; a < 10_000 && sx < 0; a++) {
      const tx = rng.int(mapWidth)
      const ty = rng.int(mapHeight)
      const terrain = tiles[(ty * mapWidth + tx) * TILE_STRIDE + TILE_TERRAIN] as TerrainType
      if (isLandStart(terrain)) { sx = tx; sy = ty }
    }
    if (sx < 0) continue  // no valid land found (shouldn't happen)

    // Place each unit in the 3×3 neighbourhood around the start, avoiding repeats
    const usedTiles = new Set<number>()

    for (const unitType of startingUnits) {
      if (total >= MAX_UNITS) break

      // Search 3×3 around start for an unused valid land tile
      let px = sx, py = sy  // fallback: stack on start
      outer:
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = sx + dx, ty = sy + dy
          if (tx < 0 || tx >= mapWidth || ty < 0 || ty >= mapHeight) continue
          const key = ty * mapWidth + tx
          if (usedTiles.has(key)) continue
          const terrain = tiles[key * TILE_STRIDE + TILE_TERRAIN] as TerrainType
          if (isLandStart(terrain)) { px = tx; py = ty; usedTiles.add(key); break outer }
        }
      }

      const off = total * UNIT_STRIDE
      unitView.setUint16(off + UNIT_X_OFF, px, true)
      unitView.setUint16(off + UNIT_Y_OFF, py, true)
      units[off + UNIT_TYPE_OFF]  = unitType
      units[off + UNIT_CIV_OFF]   = civ
      units[off + UNIT_HP_OFF]    = 100
      units[off + UNIT_MOVES_OFF] = 1
      total++
    }
  }

  unitCount[0] = total

  self.postMessage({ type: 'progress', pct: 100 })
  self.postMessage({ type: 'done', unitCount: total })
}
