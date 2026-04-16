// ── Enums ────────────────────────────────────────────────────────────────────

export enum UnitCategory {
  Melee     = 'Melee',
  Archery   = 'Archery',
  Mounted   = 'Mounted',
  Siege     = 'Siege',
  Naval     = 'Naval',
  NonCombat = 'NonCombat',
}

export enum TerrainType {
  Grassland = 0,
  Plains    = 1,
  Desert    = 2,
  Tundra    = 3,
  Snow      = 4,
  Ocean     = 5,
  Coast     = 6,
  Hill      = 7,
  Mountain  = 8,
}

export enum FeatureType {
  None       = 0,
  Forest     = 1,
  Jungle     = 2,
  Floodplain = 3,
  Oasis      = 4,
}

export enum ResourceType {
  None   =  0,
  Wheat  =  1,
  Cow    =  2,
  Horse  =  3,
  Iron   =  4,
  Gold   =  5,
  Copper =  6,
  Stone  =  7,
  Coal   =  8,
  Fish   =  9,
  Corn   = 10,
}

export enum ImprovementType {
  None        = 0,
  Farm        = 1,
  Mine        = 2,
  Pasture     = 3,
  Plantation  = 4,
  Camp        = 5,
  FishingBoat = 6,
}

export enum UnitTypeId {
  Warrior   = 0,
  Archer    = 1,
  Settler   = 2,
  Worker    = 3,
  Spearman  = 4,
  Swordsman = 5,
  Knight    = 6,
  Catapult  = 7,
  Galley    = 8,
  Scout     = 9,
  City      = 10,
}

// ── Unit actions ─────────────────────────────────────────────────────────────

export enum ActionId {
  Fortify   = 'fortify',
  FoundCity = 'found_city',
  // Future: BuildRoad = 'build_road', Irrigate = 'irrigate', BuildMine = 'build_mine'
}

export interface ActionContext {
  tileBytes: Uint8Array
  mapWidth:  number
  mapHeight: number
  unit: {
    typeId:    UnitTypeId
    civId:     number
    x:         number
    y:         number
    movesLeft: number
  }
}

export interface ActionDef {
  id:         ActionId
  label:      string
  /** Return true when this action is available given the current unit and tile state. */
  canPerform: (ctx: ActionContext) => boolean
}

// ── Definition interfaces ────────────────────────────────────────────────────

export interface TerrainDef {
  id:         TerrainType
  name:       string
  color:      number   // 0xRRGGBB
  food:       number
  production: number
  commerce:   number
  defense:    number   // percent
  moveCost:   number   // 99 = impassable
}

export interface CombatBonus {
  /** Bonus applies when fighting a unit of this category. */
  vsCategory?: UnitCategory
  /** Additive percent bonus, e.g. 100 = +100%. */
  pct: number
  onlyWhenAttacking?: boolean
  onlyWhenDefending?: boolean
  /** Bonus applies when attacking a city tile or defending in one. */
  vsCity?: boolean
  /** Bonus applies when defending on this specific terrain type. */
  vsTerrain?: TerrainType
}

export interface UnitDef {
  id:       UnitTypeId
  name:     string
  letter:   string
  strength: number
  movement: number
  isNaval:  boolean
  /** Atlas frame name (PNG filename without extension). Undefined = use letter badge. */
  sprite?:  string
  /** Unit-specific actions (Fortify is universal and not listed here). */
  actions?: ActionId[]
  /** Combat category used for type-matchup bonuses. */
  category?: UnitCategory
  /** Additive combat bonuses this unit has in specific matchups. */
  combatBonuses?: CombatBonus[]
  /** If true, terrain and feature defense bonuses are ignored (Mounted, Siege). */
  noTerrainBonus?: boolean
  /** If true, the unit cannot initiate attacks (non-combat units). */
  cannotAttack?: boolean
}

export interface ResourceDef {
  id:    ResourceType
  name:  string
  color: number
}

export interface ImprovementDef {
  id:    ImprovementType
  name:  string
  color: number
}

// ── UI / interaction ─────────────────────────────────────────────────────────

export interface TileInfo {
  x:            number
  y:            number
  terrain:      string
  feature:      string
  resource:     string
  improvement:  string
  food:         number
  production:   number
  commerce:     number
  defense:      number
  hasFreshWater: boolean
}

export interface SelectedUnit {
  id:        number
  name:      string
  civ:       number
  hp:        number
  movesLeft: number
  x:         number
  y:         number
  strength:  number
}

// ── Map layout ────────────────────────────────────────────────────────────────

export enum MapLayout {
  Continents = 'continents',  // 2-4 large landmasses
  Pangaea    = 'pangaea',     // one big continent
  Islands    = 'islands',     // 10+ small islands
  InlandSea  = 'inland_sea',  // land ring surrounding a central sea
  Lakes      = 'lakes',       // all land with scattered freshwater lakes
}

// ── Game configuration (set by New Game menu) ─────────────────────────────────

export interface GameConfig {
  mapWidth:  number
  mapHeight: number
  numCivs:   number
  /** index 0 unused; [1..numCivs] are the hex colours for each civ */
  civColors: number[]
  layout:    MapLayout
  /** One entry per player (index 0 = human, 1..n-1 = AI). Optional for save compatibility. */
  playerCivs?: readonly { readonly civName: string; readonly leaderName: string }[]
}

// ── Worker messages ──────────────────────────────────────────────────────────

export interface MapgenRequest {
  type:            'generate'
  tileBuffer:      SharedArrayBuffer
  unitBuffer:      SharedArrayBuffer
  unitCountBuffer: SharedArrayBuffer
  mapWidth:        number
  mapHeight:       number
  numCivs:         number
  seed:            number
  layout:          MapLayout
}

export type MapgenResponse =
  | { type: 'progress'; pct: number }
  | { type: 'done';     unitCount: number }
