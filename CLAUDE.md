# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server (localhost:5173) — required for SharedArrayBuffer (COOP/COEP headers)
npm run build     # tsc type-check + vite production bundle
npm run preview   # preview production build (also serves with COOP/COEP headers)
npx tsc --noEmit  # type-check only, no emit
```

There are no tests. The app must be opened in a browser to validate behaviour — the PixiJS canvas is not testable headlessly.

**SharedArrayBuffer requires Cross-Origin Isolation.** The app will not function when served by a static file server that doesn't set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Always use `npm run dev` or `npm run preview`.

## Architecture

### Data plane: SharedArrayBuffers

All mutable game state lives in two `SharedArrayBuffer`s defined in `src/shared/constants.ts`:

| Buffer | Layout | Size |
|---|---|---|
| `tileBuffer` | 7 bytes/tile: terrain, feature, resource, improvement, owner, visibility, river | `500 × 500 × 7 = 1.75 MB` |
| `unitBuffer` | 8 bytes/unit: x (Uint16 LE), y (Uint16 LE), typeId, civId, hp, movesLeft | `10 000 × 8 = 80 KB` |

A third `unitCountBuffer` (4-byte SAB) is used during mapgen to report the spawned unit count; it is read once after the worker posts `'done'`. The mapgen worker writes all three, then posts `'done'`. The main thread and game logic read/write the SABs directly — no serialisation, no copying.

The `TILE_RIVER` byte (offset 6) stores a bitmask of river edges: `N=1, E=2, S=4, W=8` (constants `RIVER_N/E/S/W` in `src/shared/constants.ts`).

### Rendering pipeline (PixiJS v8)

`src/main.ts` is the single entry point. After the worker completes, it constructs the scene in this layer order (bottom → top):

```
CameraViewport (Container)
  terrainLayer   — one Sprite per visible tile (pooled)
  riverLayer     — river edge overlays (bitmask-driven)
  featureLayer   — Forest/Jungle/Oasis overlays
  resourceLayer  — resource icon badges
  improveLayer   — Farm/Mine/Pasture overlays
  moveLayer      — valid-move green overlays + active-unit cyan border
  pathLayer      — queued-movement path preview (pink dots)
  unitLayer      — unit badge sprites (UnitRenderer)
  highlightLayer — hover (white) + selection (yellow) frames
```

**Viewport culling**: `TileRenderer` and `UnitRenderer` listen to `viewport.on('moved')` / `viewport.on('zoomed')` and only materialise sprites for tiles/units within screen bounds + a 3-tile pad (`PAD = 3`). Sprites are recycled via per-layer pools rather than destroyed.

**Texture generation**: All textures are pre-built at startup via `renderer.generateTexture({ target, frame, resolution })` — the PixiJS v8 API. Never use `RenderTexture.create()` + `renderer.render()` (that's v7). The `capture()` helper in `TextureFactory` handles this pattern. Blank textures must be `TILE_SIZE × TILE_SIZE` (not 1×1) to prevent sprite scale corruption in the pool.

**`CameraViewport`** (`src/renderer/CameraViewport.ts`) replaces pixi-viewport (removed — incompatible with PixiJS v8). It extends `Container`, handles wheel zoom, left-drag pan with deceleration, and exposes `left/right/top/bottom` world-edge getters. Right-click (button 2) is intentionally excluded from drag so it can be used for unit moves.

### Game logic

`src/game/Game.ts` owns both SAB `DataView`s and drives the turn cycle via callbacks (`GameCallbacks`) set by `main.ts`. The Game class has no imports from the renderer layer — it communicates purely through callbacks.

Turn cycle:
1. `_beginTurn()` — marks all civ units with `movesLeft = 1`, fires `onTurnStart`
2. Human turn: auto-focuses units one by one (`_setActiveUnit` → computes valid moves → fires `onActiveUnitChanged` + `onValidMovesChanged`). `requestMoveTo(tx, ty)` validates the move: adjacent tiles in `_validMoves` move immediately; far tiles trigger A* pathfinding — the first step is taken and remaining waypoints are stored in `_unitPaths` (Civ-style queued orders that auto-execute on future turns).
3. AI turn: `_runAITurn()` moves all units randomly in one synchronous pass, then `setTimeout(120ms)` before `_nextTurn()`.
4. `_nextTurn()` → `_beginTurn()` for next player; `turnNumber++` after the last player.

Valid moves are 8-directional (including diagonals), clamped to map bounds, filtered by `_passable()` which checks naval vs land terrain rules.

**A\* pathfinding** (`_findPath`): uses Chebyshev distance heuristic, linear open-set scan (fast enough for map scale), bounded by `(mapWidth + mapHeight) × 4` node budget. `previewPathTo(tx, ty)` is a pure read used for the right-button hover preview (pink path rendered by `pathLayer`).

### React UI

Zustand store (`src/ui/store.ts`) bridges game state to React. `main.ts` calls store setters directly (no circular import — store has no game imports). Game action callbacks (`endTurn`, `skipUnit`, `skipAll`) are stored as nullable functions set via `setGameActions()` after the Game instance is created.

The UI layer (`#ui-root`) sits as a CSS absolute overlay above the PixiJS canvas (`#game-canvas-mount`). Canvas input events are bound directly with `canvas.addEventListener` — not through PixiJS's event system.

**Keyboard shortcuts** (bound in `main.ts`): Space = skip active unit, Arrow keys = cycle pending units, Enter = end turn (when enabled), M = toggle minimap, C = centre on active unit + reset zoom to 1×, Escape = deselect, WASD/arrow keys = pan camera, +/- = zoom.

**Save/Load** (`src/shared/saveFormat.ts`): saves are stored in `localStorage` (key prefix `civ_save_`, index at `civ_saves_index`) and can also be exported/imported as JSON files. `SaveFile` bundles `GameConfig`, base64-encoded SAB bytes, `unitCount`, and `SavedGameState` (turn number, pending units, stored paths). The load flow: `store.loadSave()` → sets `pendingLoad` → calls `startGame()` → `startGameFn` detects `pendingLoad`, skips mapgen, decodes bytes into new SABs, calls `buildGameScene` with `savedState` → `game.restoreState()` + `game.resumeAfterLoad()`.

**Game Builder** (`src/ui/BuilderPanel.tsx`): an in-game map editor toggled via a button in the HUD. Writes directly to the tile SAB (terrain/resource/improvement bytes) or calls `game.placeUnit()` on left-click while builder mode is active. Tabs: unit, terrain, resource, improvement.

### Data definitions

`src/data/` contains static lookup tables (`TERRAIN_MAP`, `UNIT_MAP`, `RESOURCE_MAP`, `IMPROVEMENT_MAP`) as `Map<EnumId, Def>`. The mapgen worker imports these for resource/improvement placement logic. The renderer imports them for texture generation and tile info display.

### Worker

`src/workers/mapgen.worker.ts` uses Vite's `?worker` import syntax (`import MapgenWorker from './workers/mapgen.worker?worker'`). The type declaration for this is in `src/vite-env.d.ts`. Workers must use `format: 'es'` (set in `vite.config.ts`). The build target must be `'esnext'` for top-level `await` in `main.ts`.
