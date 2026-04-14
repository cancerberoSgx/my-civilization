import { create } from 'zustand'
import type { TileInfo, SelectedUnit, GameConfig } from '../shared/types'
import type { Player } from '../game/Game'

export interface ViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface GameStore {
  // ── New-game config (null = show menu) ──────────────────────────────────────
  gameConfig:    GameConfig | null
  civColors:     number[]

  // ── Loading ─────────────────────────────────────────────────────────────────
  isLoading:       boolean
  loadingProgress: number
  loadingMsg:      string

  // ── Tile / unit selection ────────────────────────────────────────────────────
  selectedTile: TileInfo | null
  selectedUnit: SelectedUnit | null

  // ── Turn state ───────────────────────────────────────────────────────────────
  turn:           number
  unitCount:      number
  currentPlayer:  Player | null
  /** Units still to act this turn */
  pendingCount:   number
  /** Whether the End-Turn button should be enabled */
  canEndTurn:     boolean
  /** Phase label shown in the HUD */
  phaseLabel:     string

  // ── Wired callbacks ──────────────────────────────────────────────────────────
  endTurn:       (() => void) | null
  skipUnit:      (() => void) | null
  skipAll:       (() => void) | null
  /** Set by main.ts; called when the user clicks New Game */
  startGameFn:   ((config: GameConfig) => void) | null

  // ── Minimap ───────────────────────────────────────────────────────────────────
  minimapVisible:  boolean
  tileBuffer:      SharedArrayBuffer | null
  viewportBounds:  ViewportBounds | null
  minimapMoveTo:   ((worldX: number, worldY: number) => void) | null

  // ── Actions ──────────────────────────────────────────────────────────────────
  /** Called from the New Game menu — stores config and triggers init */
  startGame(config: GameConfig): void
  setStartGameFn(fn: (config: GameConfig) => void): void
  setLoading(isLoading: boolean, progress?: number, msg?: string): void
  setSelectedTile(tile: TileInfo | null): void
  setSelectedUnit(unit: SelectedUnit | null): void
  setUnitCount(n: number): void
  setTurnState(player: Player, turn: number, pendingCount: number, canEndTurn: boolean, phaseLabel: string): void
  setPendingCount(n: number): void
  setCanEndTurn(v: boolean): void
  setGameActions(endTurn: () => void, skipUnit: () => void, skipAll: () => void): void
  toggleMinimap(): void
  setMinimapReady(buf: SharedArrayBuffer, moveTo: (worldX: number, worldY: number) => void): void
  setViewportBounds(b: ViewportBounds): void
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameConfig:      null,
  civColors:       [],

  isLoading:       false,
  loadingProgress: 0,
  loadingMsg:      '',

  selectedTile:  null,
  selectedUnit:  null,

  turn:          1,
  unitCount:     0,
  currentPlayer: null,
  pendingCount:  0,
  canEndTurn:    false,
  phaseLabel:    '',

  endTurn:     null,
  skipUnit:    null,
  skipAll:     null,
  startGameFn: null,

  minimapVisible: true,
  tileBuffer:     null,
  viewportBounds: null,
  minimapMoveTo:  null,

  startGame: (config) => {
    set({ gameConfig: config, civColors: config.civColors })
    get().startGameFn?.(config)
  },

  setStartGameFn: (fn) => set({ startGameFn: fn }),

  setLoading:      (isLoading, progress = 0, msg = '') =>
    set({ isLoading, loadingProgress: progress, loadingMsg: msg }),

  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),
  setUnitCount:    (n)    => set({ unitCount: n }),

  setTurnState:    (player, turn, pendingCount, canEndTurn, phaseLabel) =>
    set({ currentPlayer: player, turn, pendingCount, canEndTurn, phaseLabel }),

  setPendingCount: (n)  => set({ pendingCount: n }),
  setCanEndTurn:   (v)  => set({ canEndTurn: v }),
  setGameActions: (endTurn, skipUnit, skipAll) => set({ endTurn, skipUnit, skipAll }),

  toggleMinimap:    ()            => set(s => ({ minimapVisible: !s.minimapVisible })),
  setMinimapReady:  (buf, moveTo) => set({ tileBuffer: buf, minimapMoveTo: moveTo }),
  setViewportBounds: (b)          => set({ viewportBounds: b }),
}))
