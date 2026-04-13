import { create } from 'zustand'
import type { TileInfo, SelectedUnit } from '../shared/types'
import type { Player } from '../game/Game'

interface GameStore {
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

  // ── Game action hooks (wired from main.ts after game is created) ────────────
  endTurn:  (() => void) | null
  skipUnit: (() => void) | null
  skipAll:  (() => void) | null

  // ── Actions ──────────────────────────────────────────────────────────────────
  setLoading(isLoading: boolean, progress?: number, msg?: string): void
  setSelectedTile(tile: TileInfo | null): void
  setSelectedUnit(unit: SelectedUnit | null): void
  setTurn(turn: number): void
  setUnitCount(n: number): void
  setTurnState(player: Player, turn: number, pendingCount: number, canEndTurn: boolean, phaseLabel: string): void
  setPendingCount(n: number): void
  setCanEndTurn(v: boolean): void
  setGameActions(endTurn: () => void, skipUnit: () => void, skipAll: () => void): void
}

export const useGameStore = create<GameStore>((set) => ({
  isLoading:       true,
  loadingProgress: 0,
  loadingMsg:      'Initialising…',

  selectedTile:  null,
  selectedUnit:  null,

  turn:          1,
  unitCount:     0,
  currentPlayer: null,
  pendingCount:  0,
  canEndTurn:    false,
  phaseLabel:    '',

  endTurn:  null,
  skipUnit: null,
  skipAll:  null,

  setLoading:      (isLoading, progress = 0, msg = '') =>
    set({ isLoading, loadingProgress: progress, loadingMsg: msg }),

  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),
  setTurn:         (turn) => set({ turn }),
  setUnitCount:    (n)    => set({ unitCount: n }),

  setTurnState:    (player, turn, pendingCount, canEndTurn, phaseLabel) =>
    set({ currentPlayer: player, turn, pendingCount, canEndTurn, phaseLabel }),

  setPendingCount: (n)  => set({ pendingCount: n }),
  setCanEndTurn:   (v)  => set({ canEndTurn: v }),
  setGameActions: (endTurn, skipUnit, skipAll) => set({ endTurn, skipUnit, skipAll }),
}))
