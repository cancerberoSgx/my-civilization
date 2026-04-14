import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useGameStore } from './store'
import { TERRAIN_DEFS } from '../data/terrains'
import { TILE_STRIDE, TILE_TERRAIN, TILE_SIZE } from '../shared/constants'

// Pre-compute terrain type → [R, G, B] lookup (indexed by TerrainType enum value)
const TERRAIN_RGB: Array<[number, number, number]> = []
for (const def of TERRAIN_DEFS) {
  TERRAIN_RGB[def.id] = [
    (def.color >> 16) & 0xff,
    (def.color >>  8) & 0xff,
     def.color        & 0xff,
  ]
}

/** Returns canvas pixel dimensions that fit the map aspect ratio inside 25% of the screen. */
function computeSize(mapW: number, mapH: number): [number, number] {
  const maxW = Math.floor(window.innerWidth  * 0.25)
  const maxH = Math.floor(window.innerHeight * 0.25)
  if (mapW / maxW >= mapH / maxH) {
    return [maxW, Math.max(1, Math.round(maxW * mapH / mapW))]
  }
  return [Math.max(1, Math.round(maxH * mapW / mapH)), maxH]
}

export function Minimap(): React.ReactElement | null {
  const visible        = useGameStore(s => s.minimapVisible)
  const gameConfig     = useGameStore(s => s.gameConfig)
  const tileBuffer     = useGameStore(s => s.tileBuffer)
  const viewportBounds = useGameStore(s => s.viewportBounds)
  const moveTo         = useGameStore(s => s.minimapMoveTo)

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const mapW = gameConfig?.mapWidth  ?? 1
  const mapH = gameConfig?.mapHeight ?? 1
  const [canvasW, canvasH] = computeSize(mapW, mapH)

  // Terrain ImageData cache — rebuilt only when the map/buffer changes
  const [terrainCache, setTerrainCache] = useState<ImageData | null>(null)

  useEffect(() => {
    if (!visible || !tileBuffer || !gameConfig) return
    const tileBuf = new Uint8Array(tileBuffer)
    const imgData  = new ImageData(canvasW, canvasH)
    const data     = imgData.data

    for (let py = 0; py < canvasH; py++) {
      for (let px = 0; px < canvasW; px++) {
        const tx = Math.min(mapW - 1, Math.floor(px * mapW / canvasW))
        const ty = Math.min(mapH - 1, Math.floor(py * mapH / canvasH))
        const terrainId = tileBuf[(ty * mapW + tx) * TILE_STRIDE + TILE_TERRAIN]
        const rgb = TERRAIN_RGB[terrainId] ?? [80, 80, 80]
        const i = (py * canvasW + px) * 4
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255
      }
    }
    setTerrainCache(imgData)
  }, [visible, tileBuffer, canvasW, canvasH, mapW, mapH, gameConfig])

  // Redraw terrain + viewport rect whenever either changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !terrainCache) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.putImageData(terrainCache, 0, 0)

    if (!viewportBounds) return
    const { left, top, right, bottom } = viewportBounds
    const worldW = mapW * TILE_SIZE
    const worldH = mapH * TILE_SIZE

    const rx = (left  / worldW) * canvasW
    const ry = (top   / worldH) * canvasH
    const rw = ((right  - left) / worldW) * canvasW
    const rh = ((bottom - top)  / worldH) * canvasH

    // Semi-transparent dark fill so out-of-view area is subtly dimmed
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, canvasW, canvasH)
    // Cut out the visible area (restore terrain brightness)
    ctx.clearRect(Math.max(0, rx), Math.max(0, ry), Math.min(canvasW, rw), Math.min(canvasH, rh))
    ctx.putImageData(
      terrainCache,
      0, 0,
      Math.max(0, rx), Math.max(0, ry),
      Math.min(canvasW, rw), Math.min(canvasH, rh),
    )
    // White border around the viewport window
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth   = 1.5
    ctx.strokeRect(Math.max(0, rx), Math.max(0, ry), Math.min(canvasW, rw), Math.min(canvasH, rh))
  }, [terrainCache, viewportBounds, canvasW, canvasH, mapW, mapH])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !moveTo) return
    const rect   = canvas.getBoundingClientRect()
    const worldX = ((e.clientX - rect.left) / rect.width)  * mapW * TILE_SIZE
    const worldY = ((e.clientY - rect.top)  / rect.height) * mapH * TILE_SIZE
    moveTo(worldX, worldY)
  }, [moveTo, mapW, mapH])

  if (!visible || !gameConfig || !tileBuffer) return null

  return (
    <div style={wrapStyle}>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        onClick={handleClick}
        style={{ display: 'block', cursor: 'crosshair', width: canvasW, height: canvasH }}
      />
    </div>
  )
}

const wrapStyle: React.CSSProperties = {
  position:           'absolute',
  bottom:             0,
  right:              0,
  background:         'rgba(5,5,18,0.85)',
  borderTop:          '1px solid rgba(255,255,255,0.18)',
  borderLeft:         '1px solid rgba(255,255,255,0.18)',
  borderTopLeftRadius: 6,
  overflow:           'hidden',
  pointerEvents:      'auto',
  zIndex:             20,
}
