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
| `tileBuffer` | 6 bytes/tile: terrain, feature, resource, improvement, owner, visibility | `500 × 500 × 6 = 1.5 MB` |
| `unitBuffer` | 8 bytes/unit: x (Uint16 LE), y (Uint16 LE), typeId, civId, hp, movesLeft | `10 000 × 8 = 80 KB` |

The mapgen worker (`src/workers/mapgen.worker.ts`) writes both buffers, then posts `'done'`. The main thread and game logic read/write the same SABs directly — no serialisation, no copying.

### Rendering pipeline (PixiJS v8)

`src/main.ts` is the single entry point. After the worker completes, it constructs the scene in this layer order (bottom → top):

```
CameraViewport (Container)
  terrainLayer   — one Sprite per visible tile (pooled)
  featureLayer   — Forest/Jungle/Oasis overlays
  resourceLayer  — resource icon badges
  improveLayer   — Farm/Mine/Pasture overlays
  moveLayer      — valid-move green overlays + active-unit cyan border
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
2. Human turn: auto-focuses units one by one (`_setActiveUnit` → computes valid moves → fires `onActiveUnitChanged` + `onValidMovesChanged`). `requestMove(tx, ty)` validates against `_validMoves` set, writes SAB, advances to next pending unit.
3. AI turn: `_runAITurn()` moves all units synchronously in one loop (no `await`), then `setTimeout(120ms)` before `_nextTurn()`.
4. `_nextTurn()` → `_beginTurn()` for next player; `turnNumber++` after the last player.

Valid moves are 8-directional (including diagonals), clamped to map bounds, filtered by `_passable()` which checks naval vs land terrain rules.

### React UI

Zustand store (`src/ui/store.ts`) bridges game state to React. `main.ts` calls store setters directly (no circular import — store has no game imports). Game action callbacks (`endTurn`, `skipUnit`, `skipAll`) are stored as nullable functions set via `setGameActions()` after the Game instance is created.

The UI layer (`#ui-root`) sits as a CSS absolute overlay above the PixiJS canvas (`#game-canvas-mount`). Canvas input events are bound directly with `canvas.addEventListener` — not through PixiJS's event system.

### Data definitions

`src/data/` contains static lookup tables (`TERRAIN_MAP`, `UNIT_MAP`, `RESOURCE_MAP`, `IMPROVEMENT_MAP`) as `Map<EnumId, Def>`. The mapgen worker imports these for resource/improvement placement logic. The renderer imports them for texture generation and tile info display.

### Worker

`src/workers/mapgen.worker.ts` uses Vite's `?worker` import syntax (`import MapgenWorker from './workers/mapgen.worker?worker'`). The type declaration for this is in `src/vite-env.d.ts`. Workers must use `format: 'es'` (set in `vite.config.ts`). The build target must be `'esnext'` for top-level `await` in `main.ts`.
