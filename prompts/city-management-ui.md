(
generated with prompt: 

role: you are helping me ask a prompt to claude code to implement the city management and production of a civilization 4 like game. 
given city management context and logic defined in prompts/city-management-1.md, build a claude-code prompt so it can build the city management UI. When clicking a city unit, the city management is displayed as a modal which display the city adjacent tiles map, workers assignament, production queue, city food and growth, specialists and other info. Allow the user to change city workers assignament, and allow to administer the production queue. It also display current production item and progress. total foor, production and commerce output.
)

-----

# Task: City Management UI

## Overview

Build a city management modal that opens when a player clicks a City unit on the map.
The modal lets the player inspect city yields, assign/unassign citizens to tiles,
manage the production queue, and view specialists and buildings.

**Do not build any game logic.** All logic already exists in `src/game/city/`.
Your job is to wire it into React state and display it.

---

## Read These Files First — Before Writing Any Code

Read every file listed here before touching anything. Do not skim.

```
src/game/city/types.ts          — City, CitizenAssignment, ProductionQueueItem,
                                   BuildingDefinition, UnitDefinition, SpecialistType,
                                   WorkedTile, CityOutput, CommerceRates, TileYield

src/game/city/definitions.ts    — BUILDING_MAP, UNIT_DEF_MAP, getBuildingDef(id),
                                   getUnitDef(typeId), building ID constants

src/game/city/yields.ts         — calculateCityYields(city, centerYields, workedTiles,
                                   buildings, rates): CityOutput, getSpecialistYield(type)

src/game/city/actions.ts        — assignCitizenToTile, unassignCitizen,
                                   addToProductionQueue, removeFromQueue,
                                   reorderQueue, assignSpecialist, unassignSpecialist,
                                   autoAssignCitizens

src/shared/types.ts             — UnitTypeId (City = 10), TerrainType, enums
src/shared/constants.ts         — TILE_STRIDE, TILE_TERRAIN, TILE_FEATURE, TILE_RESOURCE,
                                   TILE_IMPROVEMENT, TILE_OWNER (byte offsets into SAB)
src/data/terrains.ts            — TERRAIN_MAP: Map<TerrainType, TerrainDef>
                                   (TerrainDef has .food .production .commerce .color)
src/ui/store.ts                 — full Zustand store (read the whole thing)
src/ui/App.tsx                  — GameHUD structure; where to mount the modal
src/ui/InfoPanel.tsx            — how the existing panel works; you will suppress it for city units
src/main.ts                     — how canvas click events work; where to hook city-click detection
src/game/Game.ts                — how performAction works; where FoundCity is handled
```

---

## What Already Exists — Do Not Re-implement

| Thing | Location |
|---|---|
| All city data types | `src/game/city/types.ts` |
| Building + unit registries | `src/game/city/definitions.ts` |
| Yield calculator | `src/game/city/yields.ts` |
| Citizen assignment actions | `src/game/city/actions.ts` |
| Tile byte layout | `src/shared/constants.ts` |
| Tile color / yields by terrain | `src/data/terrains.ts` (`TERRAIN_MAP`) |
| SharedArrayBuffer (tileBuffer) | `store.tileBuffer` |
| Map dimensions | `store.gameConfig.mapWidth / mapHeight` |

---

## Step 1 — City State in the Zustand Store

Extend `src/ui/store.ts`. Add these fields and actions alongside the existing ones.

**Import at the top of store.ts:**
```typescript
import type { City, CommerceRates } from '../game/city/types'
```

**New state fields:**
```typescript
// city state
cities:          Map<string, City>     // keyed by "x,y" (city center tile)
activeCityKey:   string | null         // "x,y" of the city whose modal is open; null = closed
commerceRates:   CommerceRates         // player science/gold/culture slider
```

**New actions:**
```typescript
openCity(key: string): void
closeCity(): void
updateCity(key: string, city: City): void
setCommerceRates(rates: CommerceRates): void
```

**Initial values:**
```typescript
cities:        new Map(),
activeCityKey: null,
commerceRates: { scienceRate: 60, goldRate: 30, cultureRate: 10 },
```

**Implementations:**
```typescript
openCity:   (key) => set({ activeCityKey: key }),
closeCity:  ()    => set({ activeCityKey: null }),
updateCity: (key, city) => set(s => {
  const next = new Map(s.cities)
  next.set(key, city)
  return { cities: next }
}),
setCommerceRates: (rates) => set({ commerceRates: rates }),
```

---

## Step 2 — Creating a City When FoundCity Is Performed

Read `src/game/Game.ts` to find where `ActionId.FoundCity` is handled inside `performAction`.

After the city unit is spawned at `(x, y)`:

1. Import `City`, `CityId`, `SpecialistType` from `src/game/city/types.ts`
2. Construct a new `City` object:
   - `id`: `\`city-\${x}-\${y}\`` cast to `CityId`
   - `name`: `"City"` (placeholder until name generation is added)
   - `ownerId`: the acting unit's `civId`
   - `foundedTurn`: current turn number
   - `x`, `y`: the Settler's position
   - `population`: 1
   - `storedFood`: 0
   - `citizenAssignments`: one entry — `{ kind: 'specialist', specialistType: SpecialistType.Scientist }`
   - `productionQueue`: `[]`
   - `builtBuildings`: `[]`
   - `greatPersonPool`: `{ points: 0, greatPeopleBorn: 0, sources: {} }`
   - `health`: 5, `happiness`: 5
   - `storedCulture`: 0
   - `cultureBorderTiles`: the 8 adjacent tile keys (`ty * mapWidth + tx`) within map bounds,
     from the 3×3 ring around `(x, y)`, excluding the center tile itself
3. Call `useGameStore.getState().updateCity(\`\${x},\${y}\`, newCity)`

---

## Step 3 — Open the Modal When a City Unit Is Clicked

Read `src/main.ts` to understand where `store.setSelectedUnit(...)` is called and how
unit clicks are detected.

After `store.setSelectedUnit(unitData)` is called for a unit whose typeId is
`UnitTypeId.City` (numeric value `10`), also call
`store.openCity(\`\${unitData.x},\${unitData.y}\`)`.

When `store.setSelectedUnit(null)` is called or the selection changes to a non-city unit,
call `store.closeCity()`.

---

## Step 4 — Suppress InfoPanel for City Units

In `src/ui/InfoPanel.tsx`, add this guard after the existing null-check at the top of
the component body:

```typescript
const activeCityKey = useGameStore(s => s.activeCityKey)
// ...existing null check for tile/unit...
if (unit && activeCityKey !== null) return null
```

---

## Step 5 — CityModal Component

Create `src/ui/CityModal.tsx`.

Mount it inside `<GameHUD />` in `src/ui/App.tsx`, after `<InfoPanel />`.

The modal renders only when `activeCityKey !== null` AND a matching `City` exists in
`store.cities`. If `activeCityKey` is set but no City model exists yet (the unit predates
city tracking), create a default on first render and call `updateCity`.

### 5a — Helper: reading tile yields from the SAB

```typescript
function getTileYield(
  tileBuffer: SharedArrayBuffer,
  tx: number,
  ty: number,
  mapWidth: number,
): TileYield {
  const view    = new DataView(tileBuffer)
  const offset  = (ty * mapWidth + tx) * TILE_STRIDE
  const terrain = view.getUint8(offset + TILE_TERRAIN) as TerrainType
  const def     = TERRAIN_MAP.get(terrain) ?? TERRAIN_MAP.get(TerrainType.Grassland)!
  return { food: def.food, production: def.production, commerce: def.commerce }
}
```

Import `TILE_STRIDE`, `TILE_TERRAIN` from `src/shared/constants.ts`.
Import `TERRAIN_MAP` from `src/data/terrains.ts`.
Import `TerrainType` from `src/shared/types.ts`.

### 5b — Derived data (compute once per render at the top of the component)

```typescript
const mapWidth      = store.gameConfig!.mapWidth
const tileBuffer    = store.tileBuffer!
const centerYields  = getTileYield(tileBuffer, city.x, city.y, mapWidth)

const workedTiles: WorkedTile[] = city.citizenAssignments
  .filter((a): a is Extract<CitizenAssignment, { kind: 'tile' }> => a.kind === 'tile')
  .map(a => {
    const tx = a.tileKey % mapWidth
    const ty = Math.floor(a.tileKey / mapWidth)
    return { tileKey: a.tileKey, yields: getTileYield(tileBuffer, tx, ty, mapWidth) }
  })

const buildings     = city.builtBuildings.map(id => getBuildingDef(id))
const cityYields    = calculateCityYields(city, centerYields, workedTiles, buildings, commerceRates)
const foodThreshold = 20 + 10 * city.population
const netFood       = cityYields.food - 2 * city.population
const turnsToGrowth = netFood > 0
  ? Math.ceil((foodThreshold - city.storedFood) / netFood)
  : null
```

### 5c — Layout

The modal is a centred fixed overlay. The canvas stays fully visible behind it.

```typescript
const overlayStyle: React.CSSProperties = {
  position:       'fixed',
  inset:          0,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  pointerEvents:  'none',    // pass-through clicks to canvas everywhere except the panel
  zIndex:         50,
}

const panelStyle: React.CSSProperties = {
  pointerEvents:  'auto',
  width:          820,
  maxHeight:      '88vh',
  overflowY:      'auto',
  background:     'rgba(8,8,22,0.97)',
  border:         '1px solid rgba(255,255,255,0.18)',
  borderRadius:   10,
  fontFamily:     'monospace',
  color:          '#e0e0e0',
  fontSize:       13,
  backdropFilter: 'blur(8px)',
  boxShadow:      '0 8px 40px rgba(0,0,0,0.7)',
}
```

---

#### Title bar

```
[City Name]   Pop: {population}   ❤ {health}   ☺ {happiness}             [× Close]
```

- City name: 16px bold `#aad4ff`
- Stats: 12px `rgba(255,255,255,0.55)`
- Close button (top-right): calls `store.closeCity()`
- Close on Escape: `useEffect` with a `keydown` listener — call `store.closeCity()` when
  `key === 'Escape'` and `activeCityKey !== null`

---

#### Body: two-column grid

`display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 16px 16px'`

---

**Left column — Tile Map**

Render a 5×5 grid centered on `(city.x, city.y)`. Offsets `dx`, `dy` run from −2 to +2.

For each cell `(tx = city.x + dx, ty = city.y + dy)`:

- Out of map bounds: dark empty cell, `opacity: 0.15`, not interactive
- `tileKey = ty * mapWidth + tx`
- Background: terrain color from `TERRAIN_MAP.get(terrain)?.color` converted
  `0xRRGGBB → '#rrggbb'` via `'#' + color.toString(16).padStart(6, '0')`
- Yields: `getTileYield(tileBuffer, tx, ty, mapWidth)`

Cell states (priority order, last applied wins):
1. **City center** `(dx===0 && dy===0)` — `border: '2px solid #ffd700'`, show `★`, not clickable
2. **Outside cultural borders** (not in `city.cultureBorderTiles`) — `opacity: 0.3`, `cursor: 'default'`, not clickable
3. **In-border, unworked** — pointer cursor
4. **In-border, worked** (`citizenAssignments` has `kind:'tile'` matching this `tileKey`) —
   `boxShadow: 'inset 0 0 0 2px rgba(60,200,80,0.8)'` + small green `●` badge top-right
5. **Hover** (in-border, not center): lighten `rgba(255,255,255,0.12)` overlay

Yield labels at the bottom of each cell, 10px: `🌾{food}` `⚒{prod}` `💰{com}`
(omit zeros).

**Click handler** (in-border, not center):
```typescript
const isWorked      = city.citizenAssignments.some(a => a.kind === 'tile' && a.tileKey === tileKey)
const hasFreeCitizen = city.citizenAssignments.some(a => a.kind === 'specialist')
if (isWorked) {
  updateCity(activeCityKey, unassignCitizen(city, tileKey))
} else if (hasFreeCitizen) {
  updateCity(activeCityKey, assignCitizenToTile(city, tileKey))
}
```

Cell size: `60px × 60px`. Grid: `gridTemplateColumns: 'repeat(5, 60px)'`, `gap: 2`

---

**Right column — Production Queue**

Section label: `PRODUCTION` in small-caps, `rgba(255,255,255,0.35)`, `fontSize: 11`

**Current item** (queue[0]), if any:
- Item name from `getBuildingDef` or `getUnitDef` — 14px bold
- Progress bar: `accumulatedHammers / cost`, color `rgba(255,160,40,0.85)` on
  `rgba(255,255,255,0.1)` track, height 8px, borderRadius 4
- Sub-label: `{accumulatedHammers} / {cost} ⚒`
- Turns estimate: `~{Math.ceil((cost - accumulated) / cityYields.production)} turns`
  (omit if `cityYields.production === 0`)

**Queued items** (index 1+) — compact row per item:
```
{name}   {cost}⚒   [↑] [↓] [✕]
```
- ↑ → `reorderQueue(city, i, i-1)` — disabled when `i === 1`
- ↓ → `reorderQueue(city, i, i+1)` — disabled when last
- ✕ → `removeFromQueue(city, i)` — always enabled
- All call `updateCity` after

**Add Building — `<select>` + "Add" button:**

Options: `[...BUILDING_MAP.values()]` filtered to buildings not in `builtBuildings`, not
already queued, and whose `prerequisites.buildings` are all in `builtBuildings`.

On "Add": `updateCity(key, addToProductionQueue(city, { kind:'building', buildingId, accumulatedHammers:0 }))`

**Add Unit — `<select>` + "Add" button:**

Options: `[...UNIT_DEF_MAP.values()]` excluding `UnitTypeId.City`.
Units whose `prerequisites.buildings` are not fully met → render as `<option disabled>`
with `(needs {missingBuildingName})` suffix.

On "Add": `updateCity(key, addToProductionQueue(city, { kind:'unit', unitTypeId, accumulatedHammers:0 }))`

---

#### Yields bar (full width, below the two-column grid)

```
🌾 {food}   ⚒ {production}   💰 {commerce}   🔬 {science}   🪙 {gold}   🎨 {culture}   ✨ {gpp} GPP
```

Colors: food `#6ecf6e` · production `#e8a040` · commerce `#e0d060` ·
science `#6eb0e8` · gold `#f0c040` · culture `#c080f0` · gpp `#e0e0e0`

---

#### Food growth bar (full width)

```
FOOD  [████████░░░░░]  {storedFood} / {foodThreshold}   net {±netFood}/turn
```

- Bar: `#6ecf6e` on `rgba(255,255,255,0.1)`, height 10px, width = `storedFood/foodThreshold*100%`
- Net food: `#6ecf6e` if ≥ 0, `#e86060` if < 0
- Append `~{turnsToGrowth} turns to grow` if `turnsToGrowth !== null`
- Append `⚠ starvation` in `#e86060` if `netFood < 0`

---

#### Specialists (full width)

For each `SpecialistType` (Scientist, Merchant, Engineer, Artist, Priest):

```
{TypeName}   {yieldHint}       [−] {count}/{maxSlots} [+]
```

- `count`: assignments with `kind:'specialist'` matching this type
- `maxSlots`: `buildings.reduce((n,b) => n + (b.specialistSlots.find(s=>s.type===type)?.count ?? 0), 0)`
- Only render the row if `maxSlots > 0 || count > 0`
- Yield hint: from `getSpecialistYield(type)`, show non-zero fields in `rgba(255,255,255,0.4)`,
  e.g. `+3🔬 +2✨`
- − → `unassignSpecialist(city, type)` then `updateCity` — disabled when `count === 0`
- + → `assignSpecialist(city, type, buildings)` then `updateCity` — disabled when `count >= maxSlots`

If any citizens remain as specialists but no type has available slots, show:
`"Unassigned citizens: {n} — Build Library / Market / Forge to unlock specialist slots."`

---

#### Buildings (full width)

Horizontal wrapping row of pill badges, one per `city.builtBuildings`:

- Label: `getBuildingDef(id).name`
- Style: `background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:10, padding:'2px 10px', fontSize:12`
- `title` tooltip: `"{name} — {cost}⚒ · {maintenance}g/turn"` + key effects
  (e.g. `"+25% science"`, `"2 Scientist slots"`, `"Granary effect"`)

If `city.builtBuildings.length === 0`: show `"No buildings yet."` in muted text.

---

## Constraints

- **Inline styles only** — `React.CSSProperties`, no CSS files, no Tailwind
- **Match existing style vocabulary**: backgrounds `rgba(8–15,8–15,20–30,0.85–0.97)`,
  borders `rgba(255,255,255,0.12–0.2)`, text `#e0e0e0`, headers `#aad4ff`,
  muted `rgba(255,255,255,0.45)`, font `monospace`
- **No new npm packages**
- **No game logic reimplementation** — call functions from `src/game/city/` only
- **TypeScript strict** — no `any`, no unsafe `!` (use guards or optional chaining)
- **Overlay passes through canvas clicks** — outer overlay: `pointerEvents:'none'`;
  inner panel: `pointerEvents:'auto'`
- **Do not add comments or JSDoc to code you don't change**
- **Do not add error handling for impossible states** (tileBuffer and gameConfig are
  guaranteed non-null when GameHUD renders)

---

## Files to Create / Modify

| Action | File |
|---|---|
| **Create** | `src/ui/CityModal.tsx` |
| **Modify** | `src/ui/store.ts` — city state (Step 1) |
| **Modify** | `src/game/Game.ts` — City object on FoundCity (Step 2) |
| **Modify** | `src/main.ts` — open/close modal on city click (Step 3) |
| **Modify** | `src/ui/InfoPanel.tsx` — suppress panel for city units (Step 4) |
| **Modify** | `src/ui/App.tsx` — mount `<CityModal />` in GameHUD (Step 5) |

Read every file you plan to modify before editing it. Work through the steps in order —
store changes first, then Game.ts, then main.ts, then the React files.

After implementing, run `npm run dev`, open the game in a browser, found a city with a
Settler, click the City unit, and verify the modal opens correctly. Test: clicking tiles
to toggle citizen assignments, adding/removing queue items, specialist +/− buttons.
