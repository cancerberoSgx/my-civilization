import { create } from 'zustand'
import type { TileInfo, SelectedUnit } from '../shared/types'

interface GameStore {
  // Loading
  isLoading:       boolean
  loadingProgress: number
  loadingMsg:      string

  // Selection
  selectedTile: TileInfo | null
  selectedUnit: SelectedUnit | null

  // HUD
  turn:      number
  unitCount: number

  // Actions
  setLoading(isLoading: boolean, progress?: number, msg?: string): void
  setSelectedTile(tile: TileInfo | null): void
  setSelectedUnit(unit: SelectedUnit | null): void
  setTurn(turn: number): void
  setUnitCount(n: number): void
}

export const useGameStore = create<GameStore>((set) => ({
  isLoading:       true,
  loadingProgress: 0,
  loadingMsg:      'Initialising…',

  selectedTile: null,
  selectedUnit: null,

  turn:      1,
  unitCount: 0,

  setLoading: (isLoading, progress = 0, msg = '') =>
    set({ isLoading, loadingProgress: progress, loadingMsg: msg }),

  setSelectedTile: (tile) => set({ selectedTile: tile }),
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),
  setTurn:         (turn) => set({ turn }),
  setUnitCount:    (n)    => set({ unitCount: n }),
}))
