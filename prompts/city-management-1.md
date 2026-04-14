(asked claude the following):
role: you are helping me ask a prompt to claude code to implement the city management and production of a civilization 4 like game. 
We need to explain claude code all the things a city management involves, such as city workers working on tiles to extract production, food, commerce, city buildings example, contruction queue, unit building, city population growth, specialists so it understand the context and can start building each city management feature
Q: What's your tech stack?
A: React + TypeScript
Q: How much of the game already exists?
A: Map/tiles exist, no city logic yet
Q: What should Claude Code prioritize first?
A: Data models & game logic only

--------

prompt starts:

# Task: Implement City Management System — Data Models & Game Logic

## Context
This is a Civilization 4-style turn-based strategy game built in React + TypeScript.
The map and tile system already exist. Each tile has a position, terrain type, and
yields (production, food, commerce). We now need to build the full city management
system on top of this. Do NOT build any UI — focus entirely on data models,
types, and game logic functions.

---

## Domain Knowledge: How Civ 4 City Management Works

Before writing any code, read this section carefully. This is the mental model
you must encode.

### 1. City Basics
A city occupies one tile (the "city center") and has a cultural border that
expands over time, claiming surrounding tiles. Key city attributes:
- name, owner (player ID), founded turn
- population (integer, starts at 1)
- stored food, stored production (accumulators between turns)
- current health and happiness (cap growth and production)

### 2. Tile Working — The Core Loop
A city with population N can assign N citizen-workers to tiles within its
borders. Each worked tile contributes its yields to the city every turn:
- FOOD → feeds population, surplus goes into a "food box"
- PRODUCTION (hammers) → goes into the production queue
- COMMERCE → converted into gold, science, or culture via sliders

Rules:
- The city center tile is always worked automatically (free yield)
- Citizens can only work tiles within the city's cultural borders
- A tile can only be worked by one city at a time
- Unassigned citizens become "specialists" (see §5)

### 3. Population Growth
- Each turn, net food = total food yield − food consumed (2 food per citizen)
- Net food accumulates in a "food box"
- When the food box fills (threshold = 20 + 10 × population), population +1,
  food box resets to 0 (or carries over a portion)
- Starvation: if net food is negative and food box hits 0, population −1
- Health and happiness can cap effective population (unhappy citizens don't work)

### 4. Production Queue
- Cities build one thing at a time from an ordered queue
- Each turn, hammer yield is added to an accumulator
- When accumulator ≥ item cost, item is completed and removed from queue,
  next item starts automatically
- Queue items can be: Units, Buildings, Wonders, or "buy with gold"
- Buildings already built cannot be queued again
- Some items have prerequisites (tech required, other building required)

### 5. Specialists
- Unworked citizens (those not assigned to tiles) become specialists
- Specialist types: Scientist, Merchant, Engineer, Artist, Priest
- Each specialist type has fixed yields (e.g. Scientist = +3 science, +2 GPP)
- Specialists generate Great People Points (GPP) toward a Great Person birth
- Max specialists of each type may be gated by buildings
  (e.g. Library allows +2 Scientists)

### 6. Buildings
Each building has:
- cost (hammers), maintenance (gold/turn), prerequisites (tech, other buildings)
- effects: yield bonuses (flat or %), specialist slots, happiness, health,
  defensive bonuses, special abilities

Example buildings:
- Granary: reduces food box reset on growth (keeps 50% of food)
- Library: +25% science, unlocks 2 Scientist specialists
- Barracks: units built here start with XP
- Market: +25% gold, unlocks 1 Merchant specialist
- Forge: +25% production, unlocks 1 Engineer specialist
- Aqueduct: +population health cap
- Courthouse: −50% city maintenance cost

### 7. Units
Units are queued and built in cities. Each unit has:
- cost (hammers), required tech, required building (e.g. Barracks for some)
- type: military, civilian, naval, air
- After completion they are spawned on the city tile

### 8. Commerce & the Slider
Raw commerce yield is split each turn according to player-level sliders:
- Science rate (%) → beakers toward current research
- Gold rate (%) → treasury income
- Culture rate (%) → cultural expansion of cities
(The sliders sum to 100%. For now, model this at the city level as outputs.)

### 9. Great People
- Specialists and Wonders generate GPP each turn into a pool
- When pool reaches threshold, a Great Person is born (type weighted by GPP sources)
- Great People are units with special one-time abilities

### 10. Turn Processing Order (per city, each turn)
1. Calculate total yields from worked tiles + specialists + buildings
2. Apply commerce to science/gold/culture outputs
3. Add hammers to production queue accumulator → check for completion
4. Add net food to food box → check for growth or starvation
5. Add GPP to great person pool → check for birth
6. Apply maintenance costs
7. Apply health/happiness effects

---

## What to Build

### Step 1 — Core Types
Create `src/game/city/types.ts` with all interfaces and enums:
- `City`, `CitizenAssignment`, `ProductionQueueItem`, `BuildingDefinition`,
  `UnitDefinition`, `SpecialistType`, `SpecialistSlot`, `GreatPersonPool`
- Make yields a reusable type: `TileYield { food, production, commerce }`
- All IDs should be typed strings (use branded types or type aliases)

### Step 2 — Building & Unit Definitions
Create `src/game/city/definitions.ts`:
- A static registry of all BuildingDefinitions (at least 8 buildings above)
- A static registry of UnitDefinitions (at least: Warrior, Archer, Swordsman,
  Settler, Worker, Galley)
- Export lookup helpers: `getBuildingDef(id)`, `getUnitDef(id)`

### Step 3 — City Yield Calculator
Create `src/game/city/yields.ts`:
- `calculateCityYields(city, workedTiles, buildings)` → returns total
  food, production, commerce, science, gold, culture, GPP per turn
- Handle tile yields + specialist yields + building bonuses (flat and %)
- Keep this function pure (no side effects)

### Step 4 — Turn Processor
Create `src/game/city/turnProcessor.ts`:
- `processCityTurn(city, gameState)` → returns updated `City`
- Runs the 7-step turn order from §10 above
- Pure function: takes current state, returns next state (immutable)
- Handles production completion, growth, starvation, great person birth

### Step 5 — City Actions
Create `src/game/city/actions.ts` — pure functions for player actions:
- `assignCitizenToTile(city, tileId)` / `unassignCitizen(city, tileId)`
- `addToProductionQueue(city, item)` / `removeFromQueue(city, index)` /
  `reorderQueue(city, fromIndex, toIndex)`
- `assignSpecialist(city, type)` / `unassignSpecialist(city, type)`
- `autoAssignCitizens(city, tiles)` — greedy assignment maximizing food first,
  then production (common Civ 4 default behavior)
- Each function returns the new `City` object (immutable updates)

---

## Constraints & Code Style
- Pure functions everywhere — no classes, no mutation
- Each file should export a clear public API
- Use TypeScript strict mode, no `any`
- Write JSDoc comments on every exported function
- Do not implement React components or hooks yet
- Do not implement persistence or networking
- Add a `__tests__` folder with at least 2 unit tests per file using Vitest

---

## Deliverables
1. `src/game/city/types.ts`
2. `src/game/city/definitions.ts`
3. `src/game/city/yields.ts`
4. `src/game/city/turnProcessor.ts`
5. `src/game/city/actions.ts`
6. `src/game/city/__tests__/` with test files for each

Start with Step 1 and confirm the types before proceeding to Step 2.
Ask if anything in the domain rules above is ambiguous before writing code.