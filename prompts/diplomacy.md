# Diplomacy System — Data Layer, Turn Processing & Foreign Advisor UI

## Overview

Implement a Civilization 4-style diplomacy system:

1. **Data layer** — types, pure logic functions, per-turn processing
2. **Civilization leaders** — assign civilizations & leaders to players at game creation
3. **Turn-driven relationship updates** — scores drift automatically each turn
4. **Foreign Advisor UI** — relationship graph, glance table, action buttons
5. **New Game menu** — player chooses their civilization and leader before starting

Do not build any AI behaviour beyond what is described. No tech tree, no religion.
All new game logic belongs in `src/game/diplomacy/`; no game logic in React components.

---

## Part A — Civ 4 Diplomacy Concepts

This section is the domain specification that drives all implementation decisions.

### Diplomatic Status

Every ordered pair of players `(A, B)` has exactly one status:

| Status | Meaning |
|---|---|
| `'peace'` | Neutral. Default. Units cannot enter each other's territory without Open Borders. |
| `'war'` | At war. Units may attack each other's units and cities. |
| `'openBorders'` | Mutual agreement to allow free movement through territory. |
| `'alliance'` | Defensive pact: if a third party declares war on one, the other automatically joins. |

Status is **not symmetric** in general (A can be at war with B while B has not yet responded),
but for simplicity in this implementation, treat all status changes as **bilateral** —
when A declares war on B, `(A,B)` and `(B,A)` both become `'war'` immediately.
Open Borders and Alliances are likewise bilateral.

### Relationship Score ("Glance")

Each directed pair `(from, to)` carries an integer **glance score** in roughly `[−100, +100]`.
Positive = friendly; negative = hostile. It is displayed in the glance table.

The score is computed fresh from accumulated modifiers each time it is needed
(not stored directly — only the modifiers are stored).

**Modifiers and their effects on the score:**

| Modifier field | Effect on score |
|---|---|
| `warMemoryTurns` | `−min(warMemoryTurns × 1.5, 30)` — how long since war was last declared on `from` by `to`. Increments while at war; decays by 1 per turn while at peace until 0. |
| `openBordersTurns` | `+min(openBordersTurns × 0.5, 8)` — turns of accumulated Open Borders between the pair. Resets when Open Borders are cancelled. |
| `peaceTurns` | `+min(peaceTurns × 0.25, 5)` — turns of uninterrupted peace. Resets on war declaration. |
| `sharedWarTurns` | `+min(sharedWarTurns × 0.5, 6)` — turns both players were at war with the same third party simultaneously. |
| `atWarPenalty` | `−20` flat while status is `'war'` (stacks with `warMemoryTurns`). |
| `allianceBonus` | `+15` flat while status is `'alliance'`. |

Formula:
```
score = round(
  + min(peaceTurns * 0.25, 5)
  + min(openBordersTurns * 0.5, 8)
  + min(sharedWarTurns * 0.5, 6)
  - min(warMemoryTurns * 1.5, 30)
  + (status === 'war' ? -20 : 0)
  + (status === 'alliance' ? 15 : 0)
)
```

### Actions the Human Player Can Take

| Action | Conditions | Effect |
|---|---|---|
| **Declare War** | Status is `'peace'` or `'openBorders'` or `'alliance'` | Sets status `'war'` for both directions; resets `peaceTurns` = 0; adds `+8` to target's `warMemoryTurns` toward initiator |
| **Make Peace** | Status is `'war'` | Sets status `'peace'`; resets `openBordersTurns` = 0 |
| **Open Borders** | Status is `'peace'` | Sets status `'openBorders'` |
| **Cancel Open Borders** | Status is `'openBorders'` | Sets status `'peace'`; resets `openBordersTurns` = 0 |
| **Propose Alliance** | Status is `'openBorders'` or `'peace'`, score ≥ 10 | Sets status `'alliance'` |
| **Break Alliance** | Status is `'alliance'` | Sets status `'peace'`; applies `−5` to other side's `warMemoryTurns` toward initiator (betrayal memory) |

### Per-Turn Modifier Updates (called once per turn, per directed pair)

```
if status === 'war':
  warMemoryTurns += 1
  peaceTurns = 0
  openBordersTurns = 0
else:
  peaceTurns += 1
  if warMemoryTurns > 0: warMemoryTurns -= 1   // slowly forgetting past wars

if status === 'openBorders' or status === 'alliance':
  openBordersTurns += 1

// Shared war bonus: both players are at war with some third party C
for each other player C (C ≠ from, C ≠ to):
  if relation(from, C).status === 'war' AND relation(to, C).status === 'war':
    sharedWarTurns += 1
    break   // count at most 1 per turn
```

### Simple AI Diplomacy (runs once per AI player's turn)

The AI evaluates the human player's attitude toward it (not its own score — it reacts
to how the human treats it) and acts:

- Score toward AI < −20 and at peace → 20 % chance to declare war on human
- Score toward AI ≥ −5 and at war → 30 % chance to propose peace (implemented by AI
  auto-accepting: just call `makePeace`)
- Score toward AI ≥ 8 and at peace (no open borders) → 20 % chance to open borders
- Score toward AI < −5 and at open borders → 15 % chance to cancel open borders

Only one action per AI player per turn. Use `Math.random()`.
Emit a store notification (`addDiplomacyEvent`) so the UI can display a banner.

---

## Part B — Files to Read Before Writing Anything

```
notes/civ-reference/civilizations.json    — civ names and leaders; derive CIV_DEFINITIONS
src/shared/types.ts                       — GameConfig, UnitTypeId, enums
src/game/Game.ts                          — Player interface, buildPlayers, _nextTurn
src/ui/store.ts                           — full Zustand store
src/ui/App.tsx                            — NewGameMenu form; GameHUD where buttons live
```

---

## Part C — New Static Data File

### `src/data/civilizations.ts`

Read `notes/civ-reference/civilizations.json`. From it derive and **hardcode** a clean
structure (do not runtime-import the JSON):

```typescript
export interface CivDefinition {
  readonly name:    string
  readonly leaders: readonly string[]
}

// Derived from notes/civ-reference/civilizations.json
// One entry per unique civilization; leaders = all non-null leader values for that civ.
export const CIV_DEFINITIONS: readonly CivDefinition[] = [ ... ]
```

Include all 34 civilizations. Preserve spelling exactly as in the JSON.
Export also a convenience lookup:
```typescript
export function getCivDef(name: string): CivDefinition | undefined
```

---

## Part D — Diplomacy Types

### `src/game/diplomacy/types.ts`

```typescript
export type DiplomaticStatus = 'peace' | 'war' | 'openBorders' | 'alliance'

/**
 * The accumulated per-turn modifiers for one directed pair (from → to).
 * The score is derived from these; they are what actually gets stored.
 */
export interface DiplomaticRelation {
  readonly status:          DiplomaticStatus
  /** Turns since a war was declared on `from` by `to`; decays in peace. */
  readonly warMemoryTurns:  number
  /** Turns of accumulated Open Borders between the pair. */
  readonly openBordersTurns: number
  /** Turns of uninterrupted peace. */
  readonly peaceTurns:      number
  /** Turns both players were simultaneously at war with a common third party. */
  readonly sharedWarTurns:  number
}

/** Key format: `"${fromId}-${toId}"`. Directed: A→B ≠ B→A. */
export type DiplomacyMap = ReadonlyMap<string, DiplomaticRelation>

export function relationKey(fromId: number, toId: number): string {
  return `${fromId}-${toId}`
}

/** A log entry shown in the Foreign Advisor event feed. */
export interface DiplomacyEvent {
  readonly turn:       number
  readonly fromId:     number   // instigator
  readonly toId:       number   // target
  readonly action:     DiplomaticStatus | 'openBorders' | 'cancelOpenBorders' | 'alliance' | 'breakAlliance'
  readonly isAI:       boolean  // true if AI-initiated
}

export const DEFAULT_RELATION: DiplomaticRelation = {
  status:           'peace',
  warMemoryTurns:   0,
  openBordersTurns: 0,
  peaceTurns:       0,
  sharedWarTurns:   0,
}
```

---

## Part E — Pure Logic Functions

### `src/game/diplomacy/relations.ts`

All functions are **pure** — they receive the full `DiplomacyMap` and return a new one.
No side-effects, no store imports.

```typescript
import type { DiplomacyMap, DiplomaticRelation, DiplomaticStatus } from './types'
import { relationKey, DEFAULT_RELATION } from './types'

/** Returns the relation from `fromId` to `toId`, or the default if missing. */
export function getRelation(map: DiplomacyMap, fromId: number, toId: number): DiplomaticRelation

/** Returns the computed glance score from `fromId`'s perspective toward `toId`. */
export function computeScore(rel: DiplomaticRelation): number

/**
 * Initialises a DiplomacyMap for `numPlayers` players (ids 1..numPlayers).
 * All pairs start with DEFAULT_RELATION.
 */
export function initDiplomacy(numPlayers: number): Map<string, DiplomaticRelation>

/**
 * Returns a new map with the status for BOTH directions set to `status`.
 * Also applies the side-effects described in Part A for each action:
 *   - declareWar: +8 to warMemoryTurns of the target, peaceTurns reset
 *   - makePeace: openBordersTurns reset
 *   - cancelOpenBorders: openBordersTurns reset
 *   - breakAlliance: −5 warMemoryTurns penalty to the other side
 */
export function declareWar(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>
export function makePeace(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>
export function openBorders(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>
export function cancelOpenBorders(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>
export function proposeAlliance(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>
export function breakAlliance(map: DiplomacyMap, fromId: number, toId: number): Map<string, DiplomaticRelation>

/**
 * Advances all per-turn modifiers for every pair.
 * `playerIds` is the full list of player ids (used for shared-war detection).
 * Returns a new map.
 */
export function advanceDiplomacyTurn(
  map:       DiplomacyMap,
  playerIds: readonly number[],
): Map<string, DiplomaticRelation>
```

Implement `computeScore` exactly as the formula in Part A.
All functions replace affected entries immutably — spread the modified relation.

---

## Part F — AI Diplomacy

### `src/game/diplomacy/aiDiplomacy.ts`

```typescript
import type { DiplomacyMap, DiplomacyEvent } from './types'
import type { Player } from '../Game'
import * as R from './relations'

/**
 * Runs one AI player's diplomacy pass.
 * Returns { nextMap, events } where events are any AI-initiated actions.
 * humanId is always player id 1.
 */
export function runAIDiplomacy(
  map:      DiplomacyMap,
  aiPlayer: Player,
  players:  readonly Player[],
  turn:     number,
): { nextMap: Map<string, DiplomaticRelation>; events: DiplomacyEvent[] }
```

Implement the logic from Part A ("Simple AI Diplomacy").
The AI only acts toward the human player (id = 1); it does not act toward other AIs.

---

## Part G — Tests

### `src/game/diplomacy/__tests__/relations.test.ts`

Write tests using Vitest covering at minimum:

- `computeScore`: verify formula — warMemoryTurns penalty, openBorders bonus, peace bonus, atWar flat penalty, alliance flat bonus
- `initDiplomacy`: all pairs initialised to DEFAULT_RELATION
- `declareWar`: both directions become `'war'`; target's `warMemoryTurns` gains 8; `peaceTurns` resets
- `makePeace`: both directions become `'peace'`; `openBordersTurns` resets
- `advanceDiplomacyTurn`: at-war pair increments `warMemoryTurns`; at-peace pair increments `peaceTurns` and decrements `warMemoryTurns`; openBorders pair increments `openBordersTurns`
- `proposeAlliance`: both directions become `'alliance'`; score gets `+15` bonus
- `cancelOpenBorders`: `openBordersTurns` resets
- `sharedWar`: when A and B are both at war with C, `sharedWarTurns` for A→B and B→A each increment by 1 per turn

---

## Part H — Extend Player & GameConfig

### Modify `src/shared/types.ts`

Add to `GameConfig`:
```typescript
/** One entry per player (index 0 = human, 1..n-1 = AI). */
playerCivs: readonly { civName: string; leaderName: string }[]
```

### Modify `src/game/Game.ts`

Extend the `Player` interface:
```typescript
export interface Player {
  id:         number
  name:       string
  isHuman:    boolean
  color:      number
  civName:    string    // e.g. "Rome"
  leaderName: string    // e.g. "Julius Caesar"
}
```

Update `buildPlayers` to accept `playerCivs` from `GameConfig`:
```typescript
export function buildPlayers(
  numCivs:    number,
  civColors:  number[],
  playerCivs: readonly { civName: string; leaderName: string }[],
): Player[]
```

Call site in `main.ts` must pass `config.playerCivs`.

---

## Part I — Store Changes

### Modify `src/ui/store.ts`

Add imports:
```typescript
import type { DiplomacyMap, DiplomacyEvent } from '../game/diplomacy/types'
import { initDiplomacy } from '../game/diplomacy/relations'
```

Add state fields:
```typescript
// ── Diplomacy ─────────────────────────────────────────────────────────────────
diplomacy:          DiplomacyMap
diplomacyEvents:    DiplomacyEvent[]    // recent log (keep last 20)
foreignAdvisorOpen: boolean
```

Add actions:
```typescript
setDiplomacy(map: DiplomacyMap): void
addDiplomacyEvent(event: DiplomacyEvent): void
/** Called by main.ts after game init to wire the action handler. */
setDiplomacyActionFn(fn: (action: string, targetId: number) => void): void
diplomacyActionFn: ((action: string, targetId: number) => void) | null
toggleForeignAdvisor(): void
```

Initial values:
```typescript
diplomacy:          new Map(),
diplomacyEvents:    [],
foreignAdvisorOpen: false,
diplomacyActionFn:  null,
```

Implementations:
```typescript
setDiplomacy:      (map)   => set({ diplomacy: map }),
addDiplomacyEvent: (event) => set(s => ({
  diplomacyEvents: [event, ...s.diplomacyEvents].slice(0, 20),
})),
setDiplomacyActionFn: (fn) => set({ diplomacyActionFn: fn }),
toggleForeignAdvisor: ()   => set(s => ({ foreignAdvisorOpen: !s.foreignAdvisorOpen })),
```

---

## Part J — Game.ts Integration

In `Game.ts`, after creating the `Game` instance (after `game.cb = { ... }` in `main.ts`):

1. Call `initDiplomacy(players.length)` and store via `gs().setDiplomacy(map)`.
2. In `_nextTurn()` (after `_processCitiesForPlayer`), call:
   ```typescript
   private _advanceDiplomacy(): void {
     const gs = useGameStore.getState()
     const playerIds = this.players.map(p => p.id)
     let map = advanceDiplomacyTurn(gs.diplomacy, playerIds)
     const events: DiplomacyEvent[] = []

     // Run AI diplomacy for every non-human player
     for (const p of this.players) {
       if (p.isHuman) continue
       const result = runAIDiplomacy(map, p, this.players, this.turnNumber)
       map = result.nextMap
       events.push(...result.events)
     }

     gs.setDiplomacy(map)
     events.forEach(e => gs.addDiplomacyEvent(e))
   }
   ```
3. Wire `setDiplomacyActionFn` in `main.ts` after game creation:
   ```typescript
   gs().setDiplomacyActionFn((action, targetId) => {
     const humanId = 1
     const gs2 = useGameStore.getState()
     let map = gs2.diplomacy
     switch (action) {
       case 'declareWar':        map = declareWar(map, humanId, targetId); break
       case 'makePeace':         map = makePeace(map, humanId, targetId); break
       case 'openBorders':       map = openBorders(map, humanId, targetId); break
       case 'cancelOpenBorders': map = cancelOpenBorders(map, humanId, targetId); break
       case 'proposeAlliance':   map = proposeAlliance(map, humanId, targetId); break
       case 'breakAlliance':     map = breakAlliance(map, humanId, targetId); break
     }
     gs2.setDiplomacy(map)
     // Log the human action
     gs2.addDiplomacyEvent({
       turn: game.turn, fromId: humanId, toId: targetId,
       action: action as DiplomacyEvent['action'], isAI: false,
     })
   })
   ```

---

## Part K — New Game Menu: Civilization Selection

### Modify `src/ui/App.tsx` — `NewGameMenu`

Add state:
```typescript
const [playerCiv,    setPlayerCiv]    = useState(CIV_DEFINITIONS[0]!.name)
const [playerLeader, setPlayerLeader] = useState(CIV_DEFINITIONS[0]!.leaders[0] ?? '')
```

Add form fields **before** the Map Width field:

```
Your Civilization: [<select> of CIV_DEFINITIONS names]
Your Leader:       [<select> dynamically filtered to selected civ's leaders]
```

When `playerCiv` changes, reset `playerLeader` to the first leader of the new civ.

In `handleSubmit`, build `playerCivs`:
```typescript
// Human player = chosen civ/leader
// AI players = randomly assigned from remaining civs (no duplicates)
const usedCivs = new Set([playerCiv])
const remaining = CIV_DEFINITIONS.filter(c => !usedCivs.has(c.name))
const aiCivs = shuffled(remaining).slice(0, n - 1)  // n - 1 AI players

const playerCivs = [
  { civName: playerCiv, leaderName: playerLeader },
  ...aiCivs.map(c => ({ civName: c.name, leaderName: c.leaders[Math.floor(Math.random() * c.leaders.length)] ?? c.name })),
]
onStart({ mapWidth: w, mapHeight: h, numCivs: n, civColors, layout, playerCivs })
```

Implement a local `shuffled<T>(arr: T[]): T[]` using Fisher-Yates.

---

## Part L — Foreign Advisor UI

### Create `src/ui/ForeignAdvisor.tsx`

Mount inside `<GameHUD />` in `App.tsx`. Add a **"Diplomacy"** button to the HUD bar
(alongside Grid / Map / Builder). The button calls `toggleForeignAdvisor()`.

The panel renders only when `foreignAdvisorOpen === true`.

#### Layout

Full-screen centred overlay (same overlay style as `CityModal`):
`position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 60`

Inner panel: `width: 900, maxHeight: '90vh', overflowY: 'auto'` — same dark monospace aesthetic.

#### Title bar

```
⚖ Foreign Advisor   Turn {turn}                              [× Close]
```

#### Section 1 — Relationship Status Grid

A player × player grid where each cell `(row, col)` shows the status between row-player
and col-player (from row's perspective). Row and column headers show
`{civName}\n{leaderName}` in small text.

Cell contents:

| Status | Symbol | Background tint |
|---|---|---|
| `'war'` | ⚔ War | `rgba(200,40,40,0.25)` |
| `'peace'` | 🏛 Peace | `rgba(80,80,80,0.15)` |
| `'openBorders'` | 🤝 Open | `rgba(40,180,100,0.2)` |
| `'alliance'` | 🛡 Alliance | `rgba(40,100,220,0.25)` |

Diagonal cells (same player) — show `—` with no background.
Cell size: `80px × 64px`. Scrollable if many players.

#### Section 2 — Glance Table

A player × player score matrix. Same grid structure as Section 1 but shows the
**integer score** instead of status icons.

Color-code each cell:
- score ≥ 15: `rgba(40,220,80,0.25)`
- score ≥ 5:  `rgba(40,180,80,0.15)`
- score > −5: `rgba(80,80,80,0.1)`
- score > −15:`rgba(220,120,40,0.15)`
- score ≤ −15:`rgba(220,40,40,0.25)`

Show the numeric value centred in the cell. Diagonal: `—`.

The row header for the human player (id = 1) is highlighted `color: '#aad4ff'`.

#### Section 3 — Diplomacy Actions

A list of all other players. For each:

```
[civ color dot] {civName} — {leaderName}    Score: {score}    [{action buttons}]
```

The **score** displayed is `computeScore(relation from human → that player)`.

**Action buttons** — show only what is valid given current status:

| Current status | Available buttons |
|---|---|
| `'peace'` | Declare War, Open Borders |
| `'war'` | Make Peace |
| `'openBorders'` | Declare War, Cancel Open Borders, Propose Alliance |
| `'alliance'` | Break Alliance |

Button styles:
- Declare War: `background: rgba(180,40,40,0.25), border: 1px solid rgba(220,80,80,0.5), color: #ff8080`
- Make Peace / Open Borders / Alliance: `background: rgba(34,102,204,0.2), border: 1px solid rgba(68,150,255,0.4), color: #88ccff`
- Cancel / Break: `background: rgba(100,80,20,0.2), border: 1px solid rgba(200,160,40,0.4), color: #ccaa44`

On click: call `gs().diplomacyActionFn?.(actionName, targetPlayerId)`.
Show a **confirmation dialog** (simple `window.confirm`) before Declare War only.

#### Section 4 — Recent Events Feed

A short scrollable list of the last 10 `diplomacyEvents`.
Format: `Turn {turn}: {fromCivName} → {toCivName}: {actionLabel}`
`isAI` events shown in `#ffcc66`; human-initiated in `#88ccff`.

#### Section 5 — Status Legend

Small row at the bottom:
`⚔ War  🏛 Peace  🤝 Open Borders  🛡 Alliance`
in muted `rgba(255,255,255,0.35)` text.

---

## Part M — HUD Button

In `GameHUD` in `App.tsx`:

```typescript
const foreignAdvisorOpen = useGameStore(s => s.foreignAdvisorOpen)
const toggleForeignAdvisor = useGameStore(s => s.toggleForeignAdvisor)
```

Add button after the Builder button:
```tsx
<button
  style={{ ...btnStyle, ...(foreignAdvisorOpen ? btnDiplomacyActive : {}) }}
  onClick={toggleForeignAdvisor}
  title="Foreign Advisor (diplomacy)"
>
  Diplomacy
</button>
```

Where `btnDiplomacyActive`:
```typescript
const btnDiplomacyActive: React.CSSProperties = {
  background: 'rgba(34,80,180,0.3)',
  border:     '1px solid rgba(68,130,255,0.6)',
  color:      '#88aaff',
}
```

---

## Part N — Constraints

- **Inline styles only** — `React.CSSProperties`, no CSS files
- **No new npm packages**
- **No game logic in React components** — only call functions from `src/game/diplomacy/`
- **TypeScript strict** — no `any`, guard before every `!`
- **Pure functions** — `relations.ts` and `aiDiplomacy.ts` must have zero side-effects
- **Overlay pass-through** — outer overlay: `pointerEvents: 'none'`; inner panel: `pointerEvents: 'auto'`
- Match existing style: backgrounds `rgba(8–15,8–15,20–30,0.85–0.97)`, borders `rgba(255,255,255,0.12–0.2)`, headers `#aad4ff`, font `monospace`
- Run `npm run test` after implementing `relations.ts` — all tests must pass
- Run `npx tsc --noEmit` — zero errors

## Files to Create / Modify

| Action | File |
|---|---|
| **Create** | `src/data/civilizations.ts` |
| **Create** | `src/game/diplomacy/types.ts` |
| **Create** | `src/game/diplomacy/relations.ts` |
| **Create** | `src/game/diplomacy/aiDiplomacy.ts` |
| **Create** | `src/game/diplomacy/__tests__/relations.test.ts` |
| **Create** | `src/ui/ForeignAdvisor.tsx` |
| **Modify** | `src/shared/types.ts` — add `playerCivs` to `GameConfig` |
| **Modify** | `src/game/Game.ts` — extend `Player`, `buildPlayers`, `_nextTurn`, `_advanceDiplomacy` |
| **Modify** | `src/ui/store.ts` — diplomacy state |
| **Modify** | `src/ui/App.tsx` — civ selection in menu; Diplomacy button; mount `<ForeignAdvisor />` |
| **Modify** | `src/main.ts` — pass `playerCivs` to `buildPlayers`; wire `setDiplomacyActionFn` |

Work through the files in this order:
1. `civilizations.ts` (data — no dependencies)
2. `diplomacy/types.ts`
3. `diplomacy/relations.ts` + tests
4. `diplomacy/aiDiplomacy.ts`
5. `shared/types.ts` + `Game.ts` (extend Player, buildPlayers, _nextTurn)
6. `store.ts` (add diplomacy state)
7. `main.ts` (wire diplomacyActionFn, pass playerCivs)
8. `App.tsx` (civ selection form + Diplomacy button)
9. `ForeignAdvisor.tsx`
