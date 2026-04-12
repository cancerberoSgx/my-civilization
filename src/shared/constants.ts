export const MAP_WIDTH  = 500
export const MAP_HEIGHT = 500
export const TILE_SIZE  = 64   // pixels per tile at zoom 1.0
export const MAX_UNITS  = 10_000
export const NUM_CIVS   = 4

// --- Tile buffer layout (6 bytes per tile) ---
export const TILE_STRIDE      = 6
export const TILE_TERRAIN     = 0  // Uint8
export const TILE_FEATURE     = 1  // Uint8
export const TILE_RESOURCE    = 2  // Uint8
export const TILE_IMPROVEMENT = 3  // Uint8
export const TILE_OWNER       = 4  // Uint8  (0 = unowned)
export const TILE_VISIBILITY  = 5  // Uint8  (0=fog, 1=explored, 2=visible)

// --- Unit buffer layout (8 bytes per unit) ---
export const UNIT_STRIDE     = 8
export const UNIT_X_OFF      = 0  // Uint16 (little-endian)
export const UNIT_Y_OFF      = 2  // Uint16 (little-endian)
export const UNIT_TYPE_OFF   = 4  // Uint8
export const UNIT_CIV_OFF    = 5  // Uint8
export const UNIT_HP_OFF     = 6  // Uint8
export const UNIT_MOVES_OFF  = 7  // Uint8

// --- Viewport ---
export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 3.0

// Civ colours (index 1-4)
export const CIV_COLORS = [
  0x000000, // 0 = unused
  0x2266cc, // 1 blue
  0xcc2222, // 2 red
  0x22aa44, // 3 green
  0xccaa00, // 4 yellow
]
