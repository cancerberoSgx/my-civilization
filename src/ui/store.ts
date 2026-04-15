import { create } from 'zustand'
import type { TileInfo, SelectedUnit, GameConfig, ActionDef } from '../shared/types'
import { UnitTypeId, TerrainType, ResourceType, ImprovementType, ActionId } from '../shared/types'
import type { Player } from '../game/Game'
import type { SaveFile } from '../shared/saveFormat'
import type { City, CommerceRates } from '../game/city/types'

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

  // ── Unit actions ─────────────────────────────────────────────────────────────
  /** Actions available for the currently focused unit (empty when no unit is active). */
  availableActions:  ActionDef[]
  /** Executes an action for the currently game-active unit. */
  performActionFn:   ((actionId: ActionId) => void) | null

  // ── Save / Load ───────────────────────────────────────────────────────────────
  /** Non-null while a load is in progress — checked by startGameFn to skip mapgen. */
  pendingLoad:  SaveFile | null
  /** Set by main.ts after scene build; returns a SaveFile with the given name. */
  saveGameFn:   ((name: string) => SaveFile) | null

  // ── Game Builder ─────────────────────────────────────────────────────────────
  builderMode:            boolean
  builderTab:             'unit' | 'terrain' | 'resource' | 'improvement'
  builderCivId:           number
  builderUnitTypeId:      UnitTypeId
  builderTerrainType:     TerrainType
  builderResourceType:    ResourceType
  builderImprovementType: ImprovementType
  builderApply:           ((tx: number, ty: number) => void) | null

  // ── City management ───────────────────────────────────────────────────────────
  cities:         Map<string, City>
  activeCityKey:  string | null
  commerceRates:  CommerceRates

  openCity(key: string): void
  closeCity(): void
  updateCity(key: string, city: City): void
  setCommerceRates(rates: CommerceRates): void

  // ── Grid ──────────────────────────────────────────────────────────────────────
  gridVisible: boolean
  setGridFn:   ((v: boolean) => void) | null
  registerGridFn(fn: (v: boolean) => void): void
  toggleGrid(): void

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

  toggleBuilderMode(): void
  setBuilderTab(tab: 'unit' | 'terrain' | 'resource' | 'improvement'): void
  setBuilderCivId(id: number): void
  setBuilderUnitTypeId(id: UnitTypeId): void
  setBuilderTerrainType(t: TerrainType): void
  setBuilderResourceType(r: ResourceType): void
  setBuilderImprovementType(i: ImprovementType): void
  setBuilderApply(fn: (tx: number, ty: number) => void): void

  setPendingLoad(save: SaveFile | null): void
  setSaveGameFn(fn: (name: string) => SaveFile): void
  /** Trigger a load: sets pendingLoad, then calls startGame so the startGameFn restores from save. */
  loadSave(save: SaveFile): void

  setAvailableActions(actions: ActionDef[]): void
  setPerformActionFn(fn: (actionId: ActionId) => void): void
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

  availableActions: [],
  performActionFn:  null,

  pendingLoad:  null,
  saveGameFn:   null,

  builderMode:            false,
  builderTab:             'unit',
  builderCivId:           1,
  builderUnitTypeId:      UnitTypeId.Warrior,
  builderTerrainType:     TerrainType.Grassland,
  builderResourceType:    ResourceType.None,
  builderImprovementType: ImprovementType.None,
  builderApply:           null,

  cities:        new Map(),
  activeCityKey: null,
  commerceRates: { scienceRate: 60, goldRate: 30, cultureRate: 10 },

  openCity:   (key)       => set({ activeCityKey: key }),
  closeCity:  ()          => set({ activeCityKey: null }),
  updateCity: (key, city) => set(s => {
    const next = new Map(s.cities)
    next.set(key, city)
    return { cities: next }
  }),
  setCommerceRates: (rates) => set({ commerceRates: rates }),

  gridVisible: false,
  setGridFn:   null,

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

  registerGridFn: (fn) => set({ setGridFn: fn }),
  toggleGrid: () => set(s => {
    const next = !s.gridVisible
    s.setGridFn?.(next)
    return { gridVisible: next }
  }),

  toggleMinimap:    ()            => set(s => ({ minimapVisible: !s.minimapVisible })),
  setMinimapReady:  (buf, moveTo) => set({ tileBuffer: buf, minimapMoveTo: moveTo }),
  setViewportBounds: (b)          => set({ viewportBounds: b }),

  toggleBuilderMode:      ()   => set(s => ({ builderMode: !s.builderMode })),
  setBuilderTab:          (tab) => set({ builderTab: tab }),
  setBuilderCivId:        (id)  => set({ builderCivId: id }),
  setBuilderUnitTypeId:   (id)  => set({ builderUnitTypeId: id }),
  setBuilderTerrainType:  (t)   => set({ builderTerrainType: t }),
  setBuilderResourceType: (r)   => set({ builderResourceType: r }),
  setBuilderImprovementType: (i) => set({ builderImprovementType: i }),
  setBuilderApply:        (fn)  => set({ builderApply: fn }),

  setPendingLoad: (save) => set({ pendingLoad: save }),
  setSaveGameFn:  (fn)   => set({ saveGameFn: fn }),
  loadSave: (save) => {
    set({ pendingLoad: save })
    get().startGame(save.config)
  },

  setAvailableActions: (actions) => set({ availableActions: actions }),
  setPerformActionFn:  (fn)      => set({ performActionFn: fn }),
}))
