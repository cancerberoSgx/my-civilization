// ── Enums ────────────────────────────────────────────────────────────────────

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

export interface UnitDef {
  id:       UnitTypeId
  name:     string
  letter:   string
  strength: number
  movement: number
  isNaval:  boolean
  /** Atlas frame name (PNG filename without extension). Undefined = use letter badge. */
  sprite?:  string
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
