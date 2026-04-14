/**
 * Entry point.
 * 1. Mount React UI (shows New Game menu immediately).
 * 2. Init PixiJS.
 * 3. Register startGame callback in the store.
 * 4. On "New Game" submit: allocate SABs, kick off mapgen worker.
 * 5. On worker 'done': build viewport + renderers, create Game, start loop.
 */
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { Application } from 'pixi.js'

import {
  TILE_SIZE,
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE, TILE_IMPROVEMENT, TILE_RIVER,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF,
  MAX_UNITS, MIN_ZOOM, MAX_ZOOM,
} from './shared/constants'
import { TerrainType, FeatureType, ResourceType, ImprovementType } from './shared/types'
import type { GameConfig, MapgenRequest, MapgenResponse } from './shared/types'

import { TERRAIN_MAP }     from './data/terrains'
import { RESOURCE_MAP }    from './data/resources'
import { IMPROVEMENT_MAP } from './data/improvements'

import { TextureFactory }     from './renderer/TextureFactory'
import { UnitTextureFactory } from './renderer/UnitTextureFactory'
import { TileRenderer }       from './renderer/TileRenderer'
import { UnitRenderer }       from './renderer/UnitRenderer'
import { CameraViewport }     from './renderer/CameraViewport'

import { Game, buildPlayers } from './game/Game'
import { useGameStore }       from './ui/store'
import { App }                from './ui/App'

import MapgenWorker from './workers/mapgen.worker?worker'

// ── 1. React UI ───────────────────────────────────────────────────────────────
createRoot(document.getElementById('ui-root')!).render(createElement(App))
const gs = () => useGameStore.getState()

// ── 2. PixiJS application ─────────────────────────────────────────────────────
const app = new Application()
await app.init({
  width:           window.innerWidth,
  height:          window.innerHeight,
  backgroundColor: 0x0a0a1a,
  antialias:       false,
  resolution:      Math.min(window.devicePixelRatio || 1, 2),
  autoDensity:     true,
  preference:      'webgl',
})
document.getElementById('game-canvas-mount')!.appendChild(app.canvas)

let activeViewport: CameraViewport | null = null
window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight)
  activeViewport?.resize(window.innerWidth, window.innerHeight)
})

// ── 3. Register startGame callback ────────────────────────────────────────────
gs().setStartGameFn((config: GameConfig) => {
  gs().setLoading(true, 5, 'Allocating buffers…')

  // ── Allocate SABs based on config ─────────────────────────────────────────
  const tileBuffer      = new SharedArrayBuffer(config.mapWidth * config.mapHeight * TILE_STRIDE)
  const unitBuffer      = new SharedArrayBuffer(MAX_UNITS * UNIT_STRIDE)
  const unitCountBuffer = new SharedArrayBuffer(4)

  // ── Start mapgen worker ───────────────────────────────────────────────────
  gs().setLoading(true, 10, 'Generating world…')
  const worker = new MapgenWorker()
  worker.postMessage({
    type:            'generate',
    tileBuffer,
    unitBuffer,
    unitCountBuffer,
    mapWidth:        config.mapWidth,
    mapHeight:       config.mapHeight,
    numCivs:         config.numCivs,
    seed:            Date.now() & 0x7fffffff,
    layout:          config.layout,
  } satisfies MapgenRequest)

  // ── 4. Worker done → build scene ─────────────────────────────────────────
  worker.onmessage = (e: MessageEvent<MapgenResponse>) => {
    if (e.data.type === 'progress') {
      gs().setLoading(true, e.data.pct, 'Generating world…')
      return
    }

    worker.terminate()
    gs().setLoading(true, 95, 'Building renderer…')

    const unitCount = new Int32Array(unitCountBuffer)[0]
    gs().setUnitCount(unitCount)

    // ── Camera viewport ────────────────────────────────────────────────────
    const viewport = new CameraViewport({
      screenWidth:  window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth:   config.mapWidth  * TILE_SIZE,
      worldHeight:  config.mapHeight * TILE_SIZE,
      minZoom:      MIN_ZOOM,
      maxZoom:      MAX_ZOOM,
      canvas:       app.canvas as HTMLCanvasElement,
    })
    activeViewport = viewport
    viewport.moveCenter(config.mapWidth * TILE_SIZE / 2, config.mapHeight * TILE_SIZE / 2)
    app.stage.addChild(viewport)

    // ── Textures ───────────────────────────────────────────────────────────
    const tf  = new TextureFactory(app.renderer)
    const utf = new UnitTextureFactory(app.renderer, config.civColors)

    // ── Renderers ──────────────────────────────────────────────────────────
    const tileRenderer = new TileRenderer(tf, tileBuffer, viewport, config.mapWidth, config.mapHeight)
    const unitRenderer = new UnitRenderer(utf, viewport, config.mapWidth, config.mapHeight)

    viewport.addChild(tileRenderer.terrainLayer)
    viewport.addChild(tileRenderer.riverLayer)      // river edges above terrain, below features
    viewport.addChild(tileRenderer.featureLayer)
    viewport.addChild(tileRenderer.resourceLayer)
    viewport.addChild(tileRenderer.improveLayer)
    viewport.addChild(tileRenderer.moveLayer)      // valid-move green overlays
    viewport.addChild(unitRenderer.layer)
    viewport.addChild(tileRenderer.highlightLayer) // hover/select/activeUnit border on top

    unitRenderer.setBuffers(unitBuffer, unitCount)
    tileRenderer.initialUpdate(viewport)

    // ── Tile info lookup helpers ───────────────────────────────────────────
    const tileBytes = new Uint8Array(tileBuffer)
    const unitView  = new DataView(unitBuffer)

    const featureName: Record<number, string> = {
      [FeatureType.None]:       'None',
      [FeatureType.Forest]:     'Forest',
      [FeatureType.Jungle]:     'Jungle',
      [FeatureType.Floodplain]: 'Floodplain',
      [FeatureType.Oasis]:      'Oasis',
    }

    // ── Game instance ──────────────────────────────────────────────────────
    const players = buildPlayers(config.numCivs, config.civColors)
    const game    = new Game(unitBuffer, tileBuffer, unitCount, config.mapWidth, config.mapHeight, players)

    game.cb = {
      onTurnStart(player, turn, pendingCount) {
        const phaseLabel = player.isHuman ? 'Your Turn' : 'AI is thinking…'
        gs().setTurnState(player, turn, pendingCount, false, phaseLabel)
        unitRenderer.triggerUpdate()
      },

      onActiveUnitChanged(uid) {
        if (uid < 0) {
          tileRenderer.setActiveUnitTile(-1, -1)
          unitRenderer.setActiveUnit(-1)
          return
        }
        const off = uid * UNIT_STRIDE
        const tx  = unitView.getUint16(off + UNIT_X_OFF, true)
        const ty  = unitView.getUint16(off + UNIT_Y_OFF, true)
        tileRenderer.setActiveUnitTile(tx, ty)
        unitRenderer.setActiveUnit(uid)
        viewport.moveCenter(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2)
      },

      onUnitMoved(uid, _fx, _fy, _tx, _ty) {
        unitRenderer.refreshUnit(uid)
      },

      onValidMovesChanged(moves) {
        tileRenderer.setValidMoves(moves)
      },

      onAllUnitsDone() {
        gs().setCanEndTurn(true)
        gs().setPendingCount(0)
      },
    }

    gs().setGameActions(
      () => game.endTurn(),
      () => game.skipActiveUnit(),
      () => game.skipAllPending(),
    )

    // ── Canvas input events ────────────────────────────────────────────────
    const canvas = app.canvas as HTMLCanvasElement

    let ptrDownX = 0, ptrDownY = 0, ptrDownBtn = 0
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      ptrDownX = e.clientX; ptrDownY = e.clientY; ptrDownBtn = e.button
    })

    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (Math.abs(e.clientX - ptrDownX) > 6 || Math.abs(e.clientY - ptrDownY) > 6) return

      const w  = viewport.toWorld(e.clientX, e.clientY)
      const tx = Math.floor(w.x / TILE_SIZE)
      const ty = Math.floor(w.y / TILE_SIZE)
      if (tx < 0 || tx >= config.mapWidth || ty < 0 || ty >= config.mapHeight) return

      if (ptrDownBtn === 2) {
        game.requestMove(tx, ty)
        return
      }

      const uid = unitRenderer.unitAt(tx, ty)
      unitRenderer.selectUnit(uid)
      gs().setSelectedUnit(uid >= 0 ? unitRenderer.getUnitInfo(uid) : null)

      tileRenderer.setSelected(tx, ty)

      const base      = (ty * config.mapWidth + tx) * TILE_STRIDE
      const terrainId = tileBytes[base + TILE_TERRAIN] as TerrainType
      const td        = TERRAIN_MAP.get(terrainId)!
      gs().setSelectedTile({
        x:             tx,
        y:             ty,
        terrain:       td.name,
        feature:       featureName[tileBytes[base + TILE_FEATURE]]  ?? 'None',
        resource:      RESOURCE_MAP.get(tileBytes[base + TILE_RESOURCE]   as ResourceType)?.name    ?? 'None',
        improvement:   IMPROVEMENT_MAP.get(tileBytes[base + TILE_IMPROVEMENT] as ImprovementType)?.name ?? 'None',
        food:          td.food,
        production:    td.production,
        commerce:      td.commerce,
        defense:       td.defense,
        hasFreshWater: tileBytes[base + TILE_RIVER] !== 0,
      })
    })

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const w = viewport.toWorld(e.clientX, e.clientY)
      tileRenderer.setHover(Math.floor(w.x / TILE_SIZE), Math.floor(w.y / TILE_SIZE))
    })

    // ── Keyboard ───────────────────────────────────────────────────────────
    const keys = new Set<string>()
    window.addEventListener('keydown', ev => {
      keys.add(ev.key)
      if (ev.key === 'Escape') {
        gs().setSelectedTile(null); gs().setSelectedUnit(null)
        tileRenderer.setSelected(-1, -1); unitRenderer.selectUnit(-1)
      }
      if (ev.key === ' ') {
        ev.preventDefault()
        game.skipActiveUnit()
      }
      if (ev.key === 'Enter') {
        if (gs().canEndTurn) game.endTurn()
      }
    })
    window.addEventListener('keyup', ev => keys.delete(ev.key))

    // ── Game tick: keyboard scroll + deceleration ──────────────────────────
    app.ticker.add(() => {
      viewport.update()

      const spd = 10 / viewport.scale.x
      let dx = 0, dy = 0
      if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) dx -= spd
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dx += spd
      if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) dy -= spd
      if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) dy += spd
      if (keys.has('+') || keys.has('=')) viewport.zoom( 0.04 * viewport.scale.x)
      if (keys.has('-'))                  viewport.zoom(-0.04 * viewport.scale.x)
      if (dx || dy) viewport.moveCorner(viewport.left + dx, viewport.top + dy)
    })

    gs().setLoading(false, 100, '')
    game.start()
  }
})
