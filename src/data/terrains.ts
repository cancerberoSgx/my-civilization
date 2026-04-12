import { TerrainType, type TerrainDef } from '../shared/types'

export const TERRAIN_DEFS: TerrainDef[] = [
  { id: TerrainType.Grassland, name: 'Grassland', color: 0x4a9a3a, food: 2, production: 0, commerce: 0, defense:  0, moveCost: 1  },
  { id: TerrainType.Plains,    name: 'Plains',    color: 0xc8b460, food: 1, production: 1, commerce: 0, defense:  0, moveCost: 1  },
  { id: TerrainType.Desert,    name: 'Desert',    color: 0xd4a843, food: 0, production: 0, commerce: 0, defense:  0, moveCost: 1  },
  { id: TerrainType.Tundra,    name: 'Tundra',    color: 0x8fa898, food: 1, production: 0, commerce: 0, defense:  0, moveCost: 1  },
  { id: TerrainType.Snow,      name: 'Snow',      color: 0xe8eef0, food: 0, production: 0, commerce: 0, defense:  0, moveCost: 1  },
  { id: TerrainType.Ocean,     name: 'Ocean',     color: 0x1a3a6b, food: 1, production: 0, commerce: 1, defense:  0, moveCost: 1  },
  { id: TerrainType.Coast,     name: 'Coast',     color: 0x2e6da1, food: 1, production: 0, commerce: 2, defense: 10, moveCost: 1  },
  { id: TerrainType.Hill,      name: 'Hill',      color: 0x8b6941, food: 0, production: 1, commerce: 0, defense: 25, moveCost: 2  },
  { id: TerrainType.Mountain,  name: 'Mountain',  color: 0x6b6b6b, food: 0, production: 0, commerce: 0, defense: 50, moveCost: 99 },
]

export const TERRAIN_MAP = new Map(TERRAIN_DEFS.map(t => [t.id, t]))
