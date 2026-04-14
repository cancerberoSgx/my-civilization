/**
 * Entry point.
 * 1. Mount React UI (shows New Game menu immediately).
 * 2. Init PixiJS.
 * 3. Register startGame callback in the store.
 * 4. On "New Game" submit: allocate SABs, kick off mapgen worker.
 * 5. On worker 'done' (or pending load): call buildGameScene().
 * 6. buildGameScene tears down any previous scene, builds viewport + renderers,
 *    creates a Game, wires callbacks, and either starts fresh or restores state.
 */
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { Application, Assets } from 'pixi.js'
import type { Spritesheet, Texture } from 'pixi.js'

import {
  TILE_SIZE,
  TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE, TILE_IMPROVEMENT, TILE_RIVER,
  UNIT_STRIDE, UNIT_X_OFF, UNIT_Y_OFF,
  MAX_UNITS, MIN_ZOOM, MAX_ZOOM,
} from './shared/constants'
import { TerrainType, FeatureType, ResourceType, ImprovementType } from './shared/types'
import type { GameConfig, MapgenRequest, MapgenResponse } from './shared/types'
import type { SavedGameState } from './shared/saveFormat'
import { bytesToBase64, base64ToBytes } from './shared/saveFormat'

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

// ── Module-level scene state (replaced on every buildGameScene call) ───────────
let activeViewport: CameraViewport | null = null
let activeGame:     Game | null = null
let sceneAbort      = new AbortController()
let tickerCb:       (() => void) | null = null

window.addEventListener('resize', () => {
  app.renderer.resize(window.innerWidth, window.innerHeight)
  activeViewport?.resize(window.innerWidth, window.innerHeight)
})

// ── buildGameScene ─────────────────────────────────────────────────────────────

async function buildGameScene(
  tileBuffer:  SharedArrayBuffer,
  unitBuffer:  SharedArrayBuffer,
  unitCount:   number,
  config:      GameConfig,
  savedState?: SavedGameState,
): Promise<void> {

  // ── Tear down any previous scene ────────────────────────────────────────────
  activeGame?.stop()
  activeGame = null

  if (activeViewport) {
    activeViewport.destroy()
    activeViewport = null
  }

  sceneAbort.abort()
  sceneAbort = new AbortController()
  const signal = sceneAbort.signal

  if (tickerCb) { app.ticker.remove(tickerCb); tickerCb = null }
  app.stage.removeChildren()

  // ── Load unit sprite atlas ──────────────────────────────────────────────────
  gs().setUnitCount(unitCount)
  let unitAtlasTextures: Record<string, Texture> = {}
  try {
    const sheet = await Assets.load<Spritesheet>('/assets/units.json')
    unitAtlasTextures = sheet.textures
  } catch {
    console.warn('Unit sprite atlas not found — falling back to letter badges.')
  }

  // ── Camera viewport ─────────────────────────────────────────────────────────
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

  // ── Textures ────────────────────────────────────────────────────────────────
  const tf  = new TextureFactory(app.renderer)
  const utf = new UnitTextureFactory(app.renderer, config.civColors, unitAtlasTextures)

  // ── Renderers ───────────────────────────────────────────────────────────────
  const tileRenderer = new TileRenderer(tf, tileBuffer, viewport, config.mapWidth, config.mapHeight)
  const unitRenderer = new UnitRenderer(utf, viewport, config.mapWidth, config.mapHeight)

  viewport.addChild(tileRenderer.terrainLayer)
  viewport.addChild(tileRenderer.riverLayer)
  viewport.addChild(tileRenderer.featureLayer)
  viewport.addChild(tileRenderer.resourceLayer)
  viewport.addChild(tileRenderer.improveLayer)
  viewport.addChild(tileRenderer.moveLayer)
  viewport.addChild(tileRenderer.pathLayer)
  viewport.addChild(unitRenderer.layer)
  viewport.addChild(tileRenderer.highlightLayer)

  unitRenderer.setBuffers(unitBuffer, unitCount)
  tileRenderer.initialUpdate(viewport)

  // ── Tile info lookup helpers ────────────────────────────────────────────────
  const tileBytes = new Uint8Array(tileBuffer)
  const unitView  = new DataView(unitBuffer)

  const featureName: Record<number, string> = {
    [FeatureType.None]:       'None',
    [FeatureType.Forest]:     'Forest',
    [FeatureType.Jungle]:     'Jungle',
    [FeatureType.Floodplain]: 'Floodplain',
    [FeatureType.Oasis]:      'Oasis',
  }

  // ── Game instance ───────────────────────────────────────────────────────────
  const players = buildPlayers(config.numCivs, config.civColors)
  const game    = new Game(unitBuffer, tileBuffer, unitCount, config.mapWidth, config.mapHeight, players)
  activeGame    = game

  game.cb = {
    onTurnStart(player, turn, pendingCount) {
      const phaseLabel = player.isHuman ? 'Your Turn' : 'AI is thinking…'
      gs().setTurnState(player, turn, pendingCount, false, phaseLabel)
      unitRenderer.triggerUpdate()
    },

    onActiveUnitChanged(uid) {
      tileRenderer.setPathPreview([])
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

    onPathChanged(path) {
      tileRenderer.setPathPreview(path)
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

  // ── Game Builder ────────────────────────────────────────────────────────────
  gs().setBuilderApply((tx, ty) => {
    const s    = gs()
    const base = (ty * config.mapWidth + tx) * TILE_STRIDE
    if (s.builderTab === 'unit') {
      if (game.placeUnit(tx, ty, s.builderUnitTypeId, s.builderCivId) >= 0) {
        unitRenderer.setBuffers(unitBuffer, game.unitCount)
        gs().setUnitCount(game.unitCount)
      }
    } else if (s.builderTab === 'terrain') {
      tileBytes[base + TILE_TERRAIN] = s.builderTerrainType
      tileRenderer.refreshTile(tx, ty)
    } else if (s.builderTab === 'resource') {
      tileBytes[base + TILE_RESOURCE] = s.builderResourceType
      tileRenderer.refreshTile(tx, ty)
    } else {
      tileBytes[base + TILE_IMPROVEMENT] = s.builderImprovementType
      tileRenderer.refreshTile(tx, ty)
    }
  })

  // ── Minimap ──────────────────────────────────────────────────────────────────
  gs().setMinimapReady(tileBuffer, (wx, wy) => viewport.moveCenter(wx, wy))
  const syncViewport = () => gs().setViewportBounds({
    left:   viewport.left,
    top:    viewport.top,
    right:  viewport.right,
    bottom: viewport.bottom,
  })
  viewport.on('moved',  syncViewport)
  viewport.on('zoomed', syncViewport)
  syncViewport()

  // ── Save / Load callbacks ────────────────────────────────────────────────────
  gs().setSaveGameFn((name: string) => ({
    version:   1 as const,
    name,
    savedAt:   new Date().toISOString(),
    config,
    tileData:  bytesToBase64(new Uint8Array(tileBuffer)),
    unitData:  bytesToBase64(new Uint8Array(unitBuffer).slice(0, game.unitCount * UNIT_STRIDE)),
    unitCount: game.unitCount,
    gameState: game.serialize(),
  }))

  // ── Canvas input events ──────────────────────────────────────────────────────
  const canvas = app.canvas as HTMLCanvasElement

  let ptrDownX = 0, ptrDownY = 0
  let rightDown = false
  let previewTx = -1, previewTy = -1

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    ptrDownX = e.clientX; ptrDownY = e.clientY
    if (e.button === 2) { rightDown = true; previewTx = -1; previewTy = -1 }
  }, { signal })

  canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const w  = viewport.toWorld(e.clientX, e.clientY)
    const tx = Math.floor(w.x / TILE_SIZE)
    const ty = Math.floor(w.y / TILE_SIZE)

    if (e.button === 2) {
      rightDown = false; previewTx = -1; previewTy = -1
      const prevActiveUid = game.activeUnitId
      tileRenderer.setPathPreview([])
      if (tx >= 0 && tx < config.mapWidth && ty >= 0 && ty < config.mapHeight) {
        game.requestMoveTo(tx, ty)
      }
      if (game.activeUnitId === prevActiveUid && game.activeUnitId >= 0) {
        tileRenderer.setPathPreview([...game.getUnitPath(game.activeUnitId)])
      }
      return
    }

    if (Math.abs(e.clientX - ptrDownX) > 6 || Math.abs(e.clientY - ptrDownY) > 6) return
    if (tx < 0 || tx >= config.mapWidth || ty < 0 || ty >= config.mapHeight) return

    if (gs().builderMode) {
      gs().builderApply?.(tx, ty)
      return
    }

    const uid = unitRenderer.unitAt(tx, ty)
    unitRenderer.selectUnit(uid)
    gs().setSelectedUnit(uid >= 0 ? unitRenderer.getUnitInfo(uid) : null)
    if (uid >= 0) game.focusUnit(uid)

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
  }, { signal })

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    const w  = viewport.toWorld(e.clientX, e.clientY)
    const tx = Math.floor(w.x / TILE_SIZE)
    const ty = Math.floor(w.y / TILE_SIZE)
    tileRenderer.setHover(tx, ty)

    if (rightDown && game.activeUnitId >= 0 && (tx !== previewTx || ty !== previewTy)) {
      previewTx = tx; previewTy = ty
      if (tx >= 0 && tx < config.mapWidth && ty >= 0 && ty < config.mapHeight) {
        tileRenderer.setPathPreview(game.previewPathTo(tx, ty) ?? [])
      } else {
        tileRenderer.setPathPreview([])
      }
    }
  }, { signal })

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  const keys = new Set<string>()
  window.addEventListener('keydown', ev => {
    keys.add(ev.key)
    if (ev.key === 'Escape') {
      gs().setSelectedTile(null); gs().setSelectedUnit(null)
      tileRenderer.setSelected(-1, -1); unitRenderer.selectUnit(-1)
    }
    if (ev.key === 'm' || ev.key === 'M') gs().toggleMinimap()
    if (ev.key === 'c' || ev.key === 'C') {
      const uid = game.activeUnitId
      if (uid >= 0) {
        const off = uid * UNIT_STRIDE
        const tx  = unitView.getUint16(off + UNIT_X_OFF, true)
        const ty  = unitView.getUint16(off + UNIT_Y_OFF, true)
        viewport.zoom(1 - viewport.scale.x)
        viewport.moveCenter(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2)
      }
    }
    if (ev.key === ' ') {
      ev.preventDefault()
      game.skipActiveUnit()
    }
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault()
      game.cyclePendingUnit(-1)
    }
    if (ev.key === 'ArrowRight') {
      ev.preventDefault()
      game.cyclePendingUnit(1)
    }
    if (ev.key === 'Enter') {
      if (gs().canEndTurn) game.endTurn()
    }
  }, { signal })
  window.addEventListener('keyup', ev => keys.delete(ev.key), { signal })

  // ── Game tick ────────────────────────────────────────────────────────────────
  tickerCb = () => {
    viewport.update()

    const spd = 10 / viewport.scale.x
    let dx = 0, dy = 0
    if (keys.has('a') || keys.has('A')) dx -= spd
    if (keys.has('d') || keys.has('D')) dx += spd
    if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) dy -= spd
    if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) dy += spd
    if (keys.has('+') || keys.has('=')) viewport.zoom( 0.04 * viewport.scale.x)
    if (keys.has('-'))                  viewport.zoom(-0.04 * viewport.scale.x)
    if (dx || dy) viewport.moveCorner(viewport.left + dx, viewport.top + dy)
  }
  app.ticker.add(tickerCb)

  // ── Start or restore ─────────────────────────────────────────────────────────
  gs().setLoading(false, 100, '')

  if (savedState) {
    game.restoreState(savedState)
    game.resumeAfterLoad()
  } else {
    game.start()
  }
}

// ── 3. Register startGame callback ────────────────────────────────────────────
gs().setStartGameFn((config: GameConfig) => {
  gs().setLoading(true, 5, 'Allocating buffers…')

  const tileBuffer = new SharedArrayBuffer(config.mapWidth * config.mapHeight * TILE_STRIDE)
  const unitBuffer = new SharedArrayBuffer(MAX_UNITS * UNIT_STRIDE)

  // ── Load path: restore from a saved file ──────────────────────────────────
  const pending = gs().pendingLoad
  if (pending) {
    gs().setPendingLoad(null)
    gs().setLoading(true, 80, 'Restoring save…')

    const tileBytes = base64ToBytes(pending.tileData)
    new Uint8Array(tileBuffer).set(tileBytes)

    const unitBytes = base64ToBytes(pending.unitData)
    new Uint8Array(unitBuffer).set(unitBytes)

    buildGameScene(tileBuffer, unitBuffer, pending.unitCount, config, pending.gameState)
      .catch(console.error)
    return
  }

  // ── Normal new-game path: run mapgen worker ────────────────────────────────
  const unitCountBuffer = new SharedArrayBuffer(4)

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

  worker.onmessage = async (e: MessageEvent<MapgenResponse>) => {
    if (e.data.type === 'progress') {
      gs().setLoading(true, e.data.pct, 'Generating world…')
      return
    }
    worker.terminate()
    gs().setLoading(true, 95, 'Building renderer…')
    const unitCount = new Int32Array(unitCountBuffer)[0]
    await buildGameScene(tileBuffer, unitBuffer, unitCount, config)
  }
})
