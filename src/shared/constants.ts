export const TILE_SIZE  = 64   // pixels per tile at zoom 1.0
export const MAX_UNITS  = 10_000

// --- Tile buffer layout (7 bytes per tile) ---
export const TILE_STRIDE      = 7
export const TILE_TERRAIN     = 0  // Uint8
export const TILE_FEATURE     = 1  // Uint8
export const TILE_RESOURCE    = 2  // Uint8
export const TILE_IMPROVEMENT = 3  // Uint8
export const TILE_OWNER       = 4  // Uint8  (0 = unowned)
export const TILE_VISIBILITY  = 5  // Uint8  (0=fog, 1=explored, 2=visible)
export const TILE_RIVER       = 6  // Uint8  bitmask: N=1, E=2, S=4, W=8

// River edge flags (bitmask stored in TILE_RIVER byte)
export const RIVER_N = 1  // river on north edge
export const RIVER_E = 2  // river on east  edge
export const RIVER_S = 4  // river on south edge
export const RIVER_W = 8  // river on west  edge

// --- Unit buffer layout (8 bytes per unit) ---
export const UNIT_STRIDE     = 8
export const UNIT_X_OFF      = 0  // Uint16 (little-endian)
export const UNIT_Y_OFF      = 2  // Uint16 (little-endian)
export const UNIT_TYPE_OFF   = 4  // Uint8
export const UNIT_CIV_OFF    = 5  // Uint8
export const UNIT_HP_OFF     = 6  // Uint8
export const UNIT_MOVES_OFF  = 7  // Uint8

// --- Viewport ---
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4.0

// Available civ colours — index 0 unused; supports up to 8 civs
export const CIV_PALETTE = [
  0x000000, // 0 = unused
  0x2266cc, // 1 blue
  0xcc2222, // 2 red
  0x22aa44, // 3 green
  0xccaa00, // 4 yellow
  0xaa44cc, // 5 purple
  0xcc7700, // 6 orange
  0x22aaaa, // 7 teal
  0xcc22aa, // 8 pink
]
