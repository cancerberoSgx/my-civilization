You are implementing a complete Civilization 4-style combat system for a TypeScript/PixiJS browser game. The codebase uses SharedArrayBuffers for unit and tile 
  state, PixiJS v8 for rendering, Zustand for UI state, and Vitest for tests. There is no existing combat — you are adding it from scratch.                       
                                                                                                                                                                  
  Do not modify the SharedArrayBuffer layout (UNIT_STRIDE = 8, TILE_STRIDE = 7). All extra runtime state (fortification turns) lives in Game.ts instance fields.  
                                                                                                                                                                  
  ---
  1. Update src/shared/types.ts                                                                                                                                   
                                                                                                                                                                  
  Add a UnitCategory enum:
  export enum UnitCategory {                                                                                                                                      
    Melee    = 'Melee',                                                                                                                                           
    Archery  = 'Archery',
    Mounted  = 'Mounted',                                                                                                                                         
    Siege    = 'Siege',                                           
    Naval    = 'Naval',                                                                                                                                           
    NonCombat = 'NonCombat',
  }                                                                                                                                                               
                                                                  
  Extend UnitDef with new optional fields:
  export interface CombatBonus {                                                                                                                                  
    vsCategory: UnitCategory   // bonus applies when fighting this category
    pct: number                // additive percent, e.g. 100 = +100%                                                                                              
    onlyWhenAttacking?: boolean                                                                                                                                   
    onlyWhenDefending?: boolean                                                                                                                                   
    vsCity?: boolean            // bonus applies when in/attacking city tile                                                                                      
    vsTerrain?: TerrainType     // bonus applies when defending on this terrain                                                                                   
  }                                                                                                                                                               
                                                                                                                                                                  
  // In UnitDef, add:                                                                                                                                             
  category?:       UnitCategory                                                                                                                                   
  combatBonuses?:  CombatBonus[]                                  
  noTerrainBonus?: boolean  // true for Mounted/Siege — ignore terrain/feature defense                                                                            
  cannotAttack?:   boolean  // true for non-combat units                                                                                                          
                                                                                                                                                                  
  ---                                                                                                                                                             
  2. Update src/data/units.ts                                                                                                                                     
                                                                                                                                                                  
  Apply categories and combat bonuses to all existing units. Import UnitCategory and FeatureType. Here is the complete replacement:
                                                                                                                                                                  
  { id: UnitTypeId.Warrior,   ..., category: UnitCategory.Melee,
    combatBonuses: [                                                                                                                                              
      { vsCity: true, pct: 25, onlyWhenDefending: true },  // +25% city defense
    ]},                                                                                                                                                           
                                                                  
  { id: UnitTypeId.Archer,    ..., category: UnitCategory.Archery,                                                                                                
    combatBonuses: [                                              
      { vsTerrain: TerrainType.Hill, pct: 25, onlyWhenDefending: true },  // +25% hills def                                                                       
      // +50% city def already handled via cityDefenseBonus in combat resolver                                                                                    
    ]},                                                                                                                                                           
                                                                                                                                                                  
  { id: UnitTypeId.Spearman,  ..., category: UnitCategory.Melee,                                                                                                  
    combatBonuses: [                                              
      { vsCategory: UnitCategory.Mounted, pct: 100 },                                                                                                             
    ]},                                                           

  { id: UnitTypeId.Swordsman, ..., category: UnitCategory.Melee,                                                                                                  
    combatBonuses: [
      { vsCity: true, pct: 10, onlyWhenAttacking: true },  // +10% city attack                                                                                    
    ]},                                                                                                                                                           
   
  { id: UnitTypeId.Knight,    ..., category: UnitCategory.Mounted, noTerrainBonus: true },                                                                        
                                                                  
  { id: UnitTypeId.Catapult,  ..., category: UnitCategory.Siege,   noTerrainBonus: true, cannotAttack: true },                                                    
                                                                  
  { id: UnitTypeId.Galley,    ..., category: UnitCategory.Naval },                                                                                                
   
  { id: UnitTypeId.Scout,     ..., category: UnitCategory.NonCombat, cannotAttack: true },                                                                        
                                                                  
  { id: UnitTypeId.Settler,   ..., category: UnitCategory.NonCombat, cannotAttack: true },                                                                        
  { id: UnitTypeId.Worker,    ..., category: UnitCategory.NonCombat, cannotAttack: true },
  { id: UnitTypeId.City,      ..., category: UnitCategory.NonCombat, cannotAttack: true },                                                                        
   
  Also add a FEATURE_DEFENSE_BONUS export used by the combat resolver:                                                                                            
  import { FeatureType } from '../shared/types'                   
  export const FEATURE_DEFENSE_BONUS = new Map<FeatureType, number>([                                                                                             
    [FeatureType.Forest,  50],                                                                                                                                    
    [FeatureType.Jungle,  50],
  ])                                                                                                                                                              
                                                                  
  ---                                                                                                                                                             
  3. Create src/game/combat/types.ts                              
                                                                                                                                                                  
  export interface CombatantStats {                               
    uid:          number
    baseStrength: number                                                                                                                                          
    currentHp:   number    // 0–100
    category:    UnitCategory                                                                                                                                     
    civId:        number                                          
    tileX:        number                                                                                                                                          
    tileY:        number                                          
    terrain:      TerrainType                                                                                                                                     
    feature:      FeatureType
    isInCity:     boolean   // a City unit exists on same tile                                                                                                    
    fortifyTurns: number    // consecutive turns fortified (0 = not fortified)                                                                                    
    cannotAttack: boolean                                                                                                                                         
    noTerrainBonus: boolean                                                                                                                                       
    combatBonuses: CombatBonus[]                                                                                                                                  
  }                                                                                                                                                               
                                                                  
  export interface CombatRound {                                                                                                                                  
    attackerDealt: number
    defenderDealt: number                                                                                                                                         
    attackerHpAfter: number                                       
    defenderHpAfter: number                                                                                                                                       
  }
                                                                                                                                                                  
  export interface CombatResult {                                 
    attackerWon:  boolean
    attackerHpFinal: number
    defenderHpFinal: number                                                                                                                                       
    rounds:       CombatRound[]
    /** True if defender was non-combat (strength 0) — they get captured, not destroyed */                                                                        
    defenderCaptured: boolean                                                                                                                                     
  }
                                                                                                                                                                  
  Import UnitCategory, TerrainType, FeatureType, CombatBonus from ../../shared/types.                                                                             
   
  ---                                                                                                                                                             
  4. Create src/game/combat/combat.ts                             
                                     
  This is a pure module — no SAB access, no imports from renderer or store. It takes plain data and a rand function.
                                                                                                                                                                  
  4a. Modified strength calculation
                                                                                                                                                                  
  export function computeModifiedStrength(                        
    unit: CombatantStats,
    opponent: CombatantStats,
    isAttacker: boolean,                                                                                                                                          
    crossingRiver: boolean,
  ): number {                                                                                                                                                     
    if (unit.baseStrength === 0) return 0                         
                                                                                                                                                                  
    // Collect additive percent bonuses                                                                                                                           
    let bonusPct = 0
                                                                                                                                                                  
    for (const bonus of unit.combatBonuses) {                     
      if (bonus.onlyWhenAttacking && !isAttacker) continue
      if (bonus.onlyWhenDefending && isAttacker) continue                                                                                                         
   
      if (bonus.vsCategory && bonus.vsCategory === opponent.category) bonusPct += bonus.pct                                                                       
      if (bonus.vsCity && (isAttacker ? opponent.isInCity : unit.isInCity)) bonusPct += bonus.pct
      if (bonus.vsTerrain != null && !isAttacker && unit.terrain === bonus.vsTerrain) bonusPct += bonus.pct                                                       
    }                                                                                                                                                             
                                                                                                                                                                  
    // Terrain and feature defense (defenders only; ignored by noTerrainBonus units)                                                                              
    if (!isAttacker && !unit.noTerrainBonus) {                    
      bonusPct += TERRAIN_MAP.get(unit.terrain)?.defense ?? 0                                                                                                     
      bonusPct += FEATURE_DEFENSE_BONUS.get(unit.feature) ?? 0                                                                                                    
    }                                                                                                                                                             
                                                                                                                                                                  
    // Fortification bonus (defenders only): +10% at 2 turns, +25% at 5+ turns                                                                                    
    if (!isAttacker) {
      if (unit.fortifyTurns >= 5) bonusPct += 25                                                                                                                  
      else if (unit.fortifyTurns >= 2) bonusPct += 10                                                                                                             
    }
                                                                                                                                                                  
    // City defense bonus (flat +25% when defending in a city)                                                                                                    
    if (!isAttacker && unit.isInCity) bonusPct += 25
                                                                                                                                                                  
    // River crossing penalty (attacker only)                                                                                                                     
    if (isAttacker && crossingRiver) bonusPct -= 25
                                                                                                                                                                  
    // Scale by current HP                                        
    const effective = unit.baseStrength * (1 + bonusPct / 100) * (unit.currentHp / 100)
    return Math.max(effective, 0.001)  // never exactly zero for division safety                                                                                  
  }                                                                                                                                                               
                                                                                                                                                                  
  Import TERRAIN_MAP from ../../data/terrains and FEATURE_DEFENSE_BONUS from ../../data/units.                                                                    
                                                                  
  4b. Combat resolver                                                                                                                                             
                                                                  
  /**
   * Resolves a full combat between attacker and defender.
   *                                                                                                                                                              
   * @param rand    Injected random function — defaults to Math.random().
   *                Pass () => 0.5 in tests for deterministic 50/50 outcomes,                                                                                     
   *                or a seeded PRNG for reproducible replays.                                                                                                    
   */                                                                                                                                                             
  export function resolveCombat(                                                                                                                                  
    attacker: CombatantStats,                                                                                                                                     
    defender: CombatantStats,                                     
    crossingRiver: boolean,
    rand: () => number = Math.random,                                                                                                                             
  ): CombatResult {
    // Non-combat defenders are captured instantly (no rounds)                                                                                                    
    if (defender.baseStrength === 0) {                                                                                                                            
      return {
        attackerWon: true,                                                                                                                                        
        attackerHpFinal: attacker.currentHp,                      
        defenderHpFinal: 0,                                                                                                                                       
        rounds: [],
        defenderCaptured: true,                                                                                                                                   
      }                                                           
    }

    const A = computeModifiedStrength(attacker, defender, true,  crossingRiver)                                                                                   
    const D = computeModifiedStrength(defender, attacker, false, false)
                                                                                                                                                                  
    // Win probability per round for attacker                                                                                                                     
    const attackerWinProb = A / (A + D)
                                                                                                                                                                  
    // Damage per round (Civ 4 formula)                           
    const atkDmg = Math.floor(20 * (3 * A + D) / (3 * D + A))
    const defDmg = Math.floor(20 * (3 * D + A) / (3 * A + D))                                                                                                     
   
    let atkHp = attacker.currentHp                                                                                                                                
    let defHp = defender.currentHp                                
    const rounds: CombatRound[] = []                                                                                                                              
                                                                  
    while (atkHp > 0 && defHp > 0) {
      const attackerWinsRound = rand() < attackerWinProb
      const aDealt = attackerWinsRound ? atkDmg : 0                                                                                                               
      const dDealt = attackerWinsRound ? 0 : defDmg                                                                                                               
                                                                                                                                                                  
      defHp = Math.max(0, defHp - aDealt)                                                                                                                         
      atkHp = Math.max(0, atkHp - dDealt)                         
                                                                                                                                                                  
      rounds.push({                                               
        attackerDealt: aDealt,
        defenderDealt: dDealt,
        attackerHpAfter: atkHp,                                                                                                                                   
        defenderHpAfter: defHp,
      })                                                                                                                                                          
    }                                                             

    return {
      attackerWon: defHp === 0,
      attackerHpFinal: atkHp,
      defenderHpFinal: defHp,                                                                                                                                     
      rounds,
      defenderCaptured: false,                                                                                                                                    
    }                                                             
  }

  ▎ Randomness note: The rand parameter is the single configuration point. Math.random by default; tests inject deterministic functions. The caller (Game.ts) can 
  ▎ expose a setter like game.setRand(fn) so the host app can wire in a seeded PRNG.
                                                                                                                                                                  
  4c. Export a helper for river crossing detection                                                                                                                
   
  /**                                                                                                                                                             
   * Returns true if moving from (ax,ay) to (dx,dy) crosses a river edge.
   * Only cardinal moves (N/S/E/W) can cross rivers; diagonals never do.                                                                                          
   */                                                                                                                                                             
  export function crossesRiver(                                                                                                                                   
    tileBytes: Uint8Array,                                                                                                                                        
    mapWidth: number,                                             
    ax: number, ay: number,                                                                                                                                       
    dx: number, dy: number,
  ): boolean {                                                                                                                                                    
    if (ax !== dx && ay !== dy) return false  // diagonal — no river penalty
                                                                                                                                                                  
    const aTileOff = (ay * mapWidth + ax) * TILE_STRIDE                                                                                                           
    const river = tileBytes[aTileOff + TILE_RIVER]                                                                                                                
                                                                                                                                                                  
    if (dx === ax && dy === ay - 1) return (river & RIVER_N) !== 0  // moving North                                                                               
    if (dx === ax && dy === ay + 1) return (river & RIVER_S) !== 0  // moving South                                                                               
    if (dx === ax + 1 && dy === ay) return (river & RIVER_E) !== 0  // moving East                                                                                
    if (dx === ax - 1 && dy === ay) return (river & RIVER_W) !== 0  // moving West
    return false                                                                                                                                                  
  }                                                               
                                                                                                                                                                  
  Import TILE_STRIDE, TILE_RIVER, RIVER_N/E/S/W from ../../shared/constants.                                                                                      
   
  ---                                                                                                                                                             
  5. Update src/game/Game.ts                                      
                                                                                                                                                                  
  5a. Add setRand and fortification tracking
                                                                                                                                                                  
  private _rand: () => number = Math.random                       
  private _fortifyTurns = new Map<number, number>()  // uid → consecutive turns fortified                                                                         
                                                                                                                                                                  
  /** Replace the RNG used for combat. Pass () => constant for deterministic tests. */                                                                            
  setRand(fn: () => number): void { this._rand = fn }                                                                                                             
                                                                                                                                                                  
  5b. Add onCombat to GameCallbacks                                                                                                                               
   
  export interface CombatEventForUI {                                                                                                                             
    attackerUid: number                                                                                                                                           
    defenderUid: number
    attackerWon: boolean                                                                                                                                          
    attackerHpFinal: number                                       
    defenderHpFinal: number
    rounds: number  // round count                                                                                                                                
  }
                                                                                                                                                                  
  // In GameCallbacks:                                            
  onCombat(event: CombatEventForUI): void
                                                                                                                                                                  
  5c. Add unit-lookup helpers (private)                                                                                                                           
                                                                                                                                                                  
  /** Returns the uid of the first live unit at (tx, ty) belonging to any civ, or -1. */                                                                          
  private _unitAt(tx: number, ty: number): number {                                                                                                               
    for (let i = 0; i < this.unitCount; i++) {
      const off = i * UNIT_STRIDE                                                                                                                                 
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue  // dead/removed                                                                                     
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)                                                                                                  
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)                                                                                                  
      if (ux === tx && uy === ty) return i                                                                                                                        
    }                                                                                                                                                             
    return -1                                                                                                                                                     
  }                                                               

  /** Returns true if civA and civB are currently at war. */                                                                                                      
  private _atWar(civA: number, civB: number): boolean {
    const diplomacy = useGameStore.getState().diplomacy                                                                                                           
    if (!diplomacy) return false                                                                                                                                  
    return getRelation(diplomacy, civA, civB).status === 'war'                                                                                                    
  }                                                                                                                                                               
                                                                                                                                                                  
  /** Returns true if any City unit sits on tile (tx, ty). */                                                                                                     
  private _isCityTile(tx: number, ty: number): boolean {          
    for (let i = 0; i < this.unitCount; i++) {                                                                                                                    
      const off = i * UNIT_STRIDE
      if (this.unitBytes[off + UNIT_CIV_OFF] === 0) continue                                                                                                      
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)                                                                                                  
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)
      if (ux === tx && uy === ty &&                                                                                                                               
          (this.unitBytes[off + UNIT_TYPE_OFF] as UnitTypeId) === UnitTypeId.City) {                                                                              
        return true                                                                                                                                               
      }                                                                                                                                                           
    }                                                                                                                                                             
    return false                                                  
  }

  Import getRelation from ./diplomacy/relations.                                                                                                                  
   
  5d. Modify _passable to allow attacking enemy tiles                                                                                                             
                                                                  
  _passable should now also accept tiles occupied by enemy units (when at war). Add an optional forPathfinding flag — when pathfinding, enemy tiles remain        
  impassable (you can't path through them):
                                                                                                                                                                  
  private _passable(uid: number, tx: number, ty: number, forPathfinding = false): boolean {
    // ... existing terrain check unchanged ...                                                                                                                   
   
    // Check occupying unit                                                                                                                                       
    const occupantUid = this._unitAt(tx, ty)                      
    if (occupantUid >= 0) {                                                                                                                                       
      const unitCiv     = this.unitBytes[uid         * UNIT_STRIDE + UNIT_CIV_OFF]
      const occupantCiv = this.unitBytes[occupantUid * UNIT_STRIDE + UNIT_CIV_OFF]                                                                                
                                                                                                                                                                  
      if (occupantCiv === unitCiv) return false  // friendly unit — always blocked                                                                                
                                                                                                                                                                  
      // Enemy unit: passable (= attackable) only when at war, and never for pathfinding                                                                          
      if (forPathfinding) return false                            
      return this._atWar(unitCiv, occupantCiv)                                                                                                                    
    }                                                                                                                                                             
    return true  // (terrain check already passed above)
  }                                                                                                                                                               
                                                                  
  Pass forPathfinding = true in _findPath neighbour expansion.                                                                                                    
                                                                  
  5e. Add the attack handler                                                                                                                                      
   
  /**                                                                                                                                                             
   * Execute combat when uid moves onto an enemy-occupied tile.   
   * Called from _executeStep when an occupant is detected.                                                                                                       
   */                                                                                                                                                             
  private _doAttack(uid: number, defenderUid: number): void {                                                                                                     
    import { resolveCombat, crossesRiver, computeModifiedStrength } from './combat/combat'                                                                        
    import type { CombatantStats } from './combat/types'                                                                                                          
                                                                                                                                                                  
    const aOff = uid         * UNIT_STRIDE                                                                                                                        
    const dOff = defenderUid * UNIT_STRIDE                                                                                                                        
                                                                                                                                                                  
    const ax = this.unitView.getUint16(aOff + UNIT_X_OFF, true)
    const ay = this.unitView.getUint16(aOff + UNIT_Y_OFF, true)                                                                                                   
    const dx = this.unitView.getUint16(dOff + UNIT_X_OFF, true)                                                                                                   
    const dy = this.unitView.getUint16(dOff + UNIT_Y_OFF, true)
                                                                                                                                                                  
    const aTileOff = (ay * this.mapWidth + ax) * TILE_STRIDE      
    const dTileOff = (dy * this.mapWidth + dx) * TILE_STRIDE                                                                                                      
                                                                  
    const aTypeId = this.unitBytes[aOff + UNIT_TYPE_OFF] as UnitTypeId                                                                                            
    const dTypeId = this.unitBytes[dOff + UNIT_TYPE_OFF] as UnitTypeId
    const aDef = UNIT_MAP.get(aTypeId)!                                                                                                                           
    const dDef = UNIT_MAP.get(dTypeId)!                                                                                                                           
                                                                                                                                                                  
    const attacker: CombatantStats = {                                                                                                                            
      uid,                                                        
      baseStrength:  aDef.strength,
      currentHp:     this.unitBytes[aOff + UNIT_HP_OFF],                                                                                                          
      category:      aDef.category ?? UnitCategory.Melee,
      civId:         this.unitBytes[aOff + UNIT_CIV_OFF],                                                                                                         
      tileX: ax, tileY: ay,                                       
      terrain:       this.tileBytes[aTileOff + TILE_TERRAIN] as TerrainType,                                                                                      
      feature:       this.tileBytes[aTileOff + TILE_FEATURE] as FeatureType,                                                                                      
      isInCity:      this._isCityTile(ax, ay),                                                                                                                    
      fortifyTurns:  0,  // attacker is moving — not fortified                                                                                                    
      cannotAttack:  aDef.cannotAttack ?? false,                                                                                                                  
      noTerrainBonus: aDef.noTerrainBonus ?? false,               
      combatBonuses: aDef.combatBonuses ?? [],                                                                                                                    
    }                                                             
                                                                                                                                                                  
    const defender: CombatantStats = {                            
      uid: defenderUid,
      baseStrength:  dDef.strength,
      currentHp:     this.unitBytes[dOff + UNIT_HP_OFF],                                                                                                          
      category:      dDef.category ?? UnitCategory.Melee,
      civId:         this.unitBytes[dOff + UNIT_CIV_OFF],                                                                                                         
      tileX: dx, tileY: dy,                                                                                                                                       
      terrain:       this.tileBytes[dTileOff + TILE_TERRAIN] as TerrainType,
      feature:       this.tileBytes[dTileOff + TILE_FEATURE] as FeatureType,                                                                                      
      isInCity:      this._isCityTile(dx, dy),                                                                                                                    
      fortifyTurns:  this._fortifyTurns.get(defenderUid) ?? 0,
      cannotAttack:  dDef.cannotAttack ?? false,                                                                                                                  
      noTerrainBonus: dDef.noTerrainBonus ?? false,               
      combatBonuses: dDef.combatBonuses ?? [],                                                                                                                    
    }                                                                                                                                                             
   
    // Skip if attacker cannot attack                                                                                                                             
    if (attacker.cannotAttack) return                             
                                                                                                                                                                  
    const river = crossesRiver(this.tileBytes, this.mapWidth, ax, ay, dx, dy)
    const result = resolveCombat(attacker, defender, river, this._rand)                                                                                           
                                                                                                                                                                  
    // Apply HP changes
    this.unitBytes[aOff + UNIT_HP_OFF] = result.attackerHpFinal                                                                                                   
    this.unitBytes[dOff + UNIT_HP_OFF] = result.defenderHpFinal                                                                                                   
   
    if (result.defenderCaptured) {                                                                                                                                
      // Non-combat capture: transfer ownership                   
      this.unitBytes[dOff + UNIT_CIV_OFF] = attacker.civId                                                                                                        
    } else if (!result.attackerWon) {                                                                                                                             
      // Attacker dies: remove from game
      this.unitBytes[aOff + UNIT_CIV_OFF]   = 0                                                                                                                   
      this.unitBytes[aOff + UNIT_MOVES_OFF] = 0                   
      this._pendingIds.delete(uid)                                                                                                                                
      this._fortifyTurns.delete(uid)                              
    } else {                                                                                                                                                      
      // Defender dies: remove, attacker moves onto the tile      
      this.unitBytes[dOff + UNIT_CIV_OFF]   = 0                                                                                                                   
      this.unitBytes[dOff + UNIT_MOVES_OFF] = 0                   
      this._fortifyTurns.delete(defenderUid)                                                                                                                      
      this._applyMove(uid, dx, dy)                                
      this.cb.onUnitMoved(uid, ax, ay, dx, dy)                                                                                                                    
    }                                                                                                                                                             
                                                                                                                                                                  
    // Attacker breaking fortification (always — attack costs a move)                                                                                             
    this._fortifyTurns.delete(uid)                                                                                                                                
                                                                                                                                                                  
    this.cb.onCombat({                                                                                                                                            
      attackerUid:     uid,
      defenderUid,                                                                                                                                                
      attackerWon:     result.attackerWon,                        
      attackerHpFinal: result.attackerHpFinal,
      defenderHpFinal: result.defenderHpFinal,                                                                                                                    
      rounds:          result.rounds.length,
    })                                                                                                                                                            
                                                                  
    this.cb.onUnitsChanged(this.unitCount)                                                                                                                        
   
    if (result.attackerWon || result.defenderCaptured) {                                                                                                          
      if (this.unitBytes[aOff + UNIT_MOVES_OFF] > 0) {            
        this._setActiveUnit(uid, true)                                                                                                                            
      } else {                                                                                                                                                    
        this._pendingIds.delete(uid)                                                                                                                              
        this._advanceActiveUnit()                                                                                                                                 
      }                                                           
    } else {
      this._advanceActiveUnit()                                                                                                                                   
    }
  }                                                                                                                                                               
                                                                  
  5f. Modify _executeStep to intercept attacks

  At the top of _executeStep, before _applyMove, add:                                                                                                             
  private _executeStep(uid: number, toX: number, toY: number): void {
    const occupantUid = this._unitAt(toX, toY)                                                                                                                    
    if (occupantUid >= 0) {                                                                                                                                       
      this._doAttack(uid, occupantUid)
      return                                                                                                                                                      
    }                                                                                                                                                             
    // ... rest of existing _executeStep unchanged ...
    this._fortifyTurns.delete(uid)  // moving breaks fortification                                                                                                
    // existing: _applyMove, onUnitMoved, ...                     
  }                                                                                                                                                               
                                                                                                                                                                  
  Also add this._fortifyTurns.delete(uid) in _applyMove or immediately before it in _executeStep.                                                                 
                                                                                                                                                                  
  5g. Fortification tracking                                      
                                                                                                                                                                  
  In _beginTurn, after assigning movesLeft, increment fortify turns for units that were skipped/fortified last turn:                                              
  // Units that didn't move last turn (movesLeft was 0 at turn start without having been just assigned)
  // — track in _beginTurn by checking: if unit is still in the _fortifyTurns map, it survived fortified                                                          
  // Simpler approach: at turn start, any unit NOT in _pendingIds from the prior turn gets +1 fortify turn                                                        
                                                                                                                                                                  
  Actually the cleanest approach: add a _fortifiedUids = new Set<number>() tracking which units explicitly chose Fortify this turn. At _beginTurn, for every unit 
  being given moves:                                                                                                                                              
  if (this._fortifiedUids.has(i)) {                                                                                                                               
    const cur = this._fortifyTurns.get(i) ?? 0                                                                                                                    
    this._fortifyTurns.set(i, cur + 1)                            
  } else {                                                                                                                                                        
    // unit moved last turn — reset fortify (already deleted on move, but ensure clean)
  }                                                                                                                                                               
  this._fortifiedUids.delete(i)                                                                                                                                   
                               
  In performAction for ActionId.Fortify, after skipping:                                                                                                          
  this._fortifiedUids.add(uid)                                                                                                                                    
   
  Add private _fortifiedUids = new Set<number>() as an instance field.                                                                                            
                                                                  
  5h. Update _computeValidMoves to show enemy tiles                                                                                                               
                                                                  
  The valid-move overlay should include adjacent enemy-occupied (attackable) tiles. Since _passable now returns true for enemy tiles when at war, no change is    
  needed — the existing loop already calls _passable.             
                                                                                                                                                                  
  5i. Update AI to attack                                         

  In _moveRandom, before the direction shuffle loop, add a check: if any adjacent tile has an enemy unit and we're at war, prefer attacking:                      
   
  private _moveRandom(uid: number): void {                                                                                                                        
    const off = uid * UNIT_STRIDE                                 
      const ux = this.unitView.getUint16(off + UNIT_X_OFF, true)
      const uy = this.unitView.getUint16(off + UNIT_Y_OFF, true)                                                                                                  
      const unitCiv = this.unitBytes[off + UNIT_CIV_OFF]        
                                                                                                                                                                  
      // Check for adjacent enemy to attack first                 
      let attacked = false                                                                                                                                        
      for (const [dx, dy] of DIRS) {                              
        const tx = ux + dx, ty = uy + dy                                                                                                                          
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue                                                                             
        const occ = this._unitAt(tx, ty)                                             
        if (occ >= 0 && this._atWar(unitCiv, this.unitBytes[occ * UNIT_STRIDE + UNIT_CIV_OFF])) {                                                                 
          this._doAttack(uid, occ)                                                                                                                                
          attacked = true                                                                                                                                         
          break                                                                                                                                                   
        }                                                                                                                                                         
      }                                                           
      if (attacked) break  // _doAttack handles move consumption
                                                                
      // ... rest of existing _moveRandom unchanged ...                                                                                                           
    }                                                                                                                                                             
  }                                                                                                                                                               
                                                                                                                                                                  
  ---                                                             
  6. Create src/game/combat/__tests__/combat.test.ts
                                                    
  Follow the Vitest pattern from src/game/city/__tests__/. All tests use injected rand functions for determinism.
                                                                                                                                                                  
  import { describe, it, expect } from 'vitest'
  import { resolveCombat, computeModifiedStrength, crossesRiver } from '../combat'                                                                                
  import type { CombatantStats } from '../types'                                                                                                                  
  import { UnitCategory, TerrainType, FeatureType } from '../../../shared/types'
  import { TILE_STRIDE, TILE_RIVER, RIVER_E } from '../../../shared/constants'                                                                                    
                                                                  
  // ── Test fixtures ──────────────────────────────────────────────────────────────                                                                              
                                                                  
  function makeCombatant(overrides: Partial<CombatantStats> = {}): CombatantStats {                                                                               
    return {                                                      
      uid: 0,                                                                                                                                                     
      baseStrength: 5,                                            
      currentHp: 100,
      category: UnitCategory.Melee,                                                                                                                               
      civId: 1,
      tileX: 0, tileY: 0,                                                                                                                                         
      terrain: TerrainType.Grassland,                             
      feature: FeatureType.None,                                                                                                                                  
      isInCity: false,
      fortifyTurns: 0,                                                                                                                                            
      cannotAttack: false,                                        
      noTerrainBonus: false,
      combatBonuses: [],
      ...overrides,                                                                                                                                               
    }
  }                                                                                                                                                               
                                                                  
  const RAND_HIGH = () => 0.99  // attacker almost always wins round                                                                                              
  const RAND_LOW  = () => 0.01  // defender almost always wins round
                                                                                                                                                                  
  // ── resolveCombat ──────────────────────────────────────────────────────────────
                                                                                                                                                                  
  describe('resolveCombat — basic outcomes', () => {                                                                                                              
    it('attacker with RAND_HIGH wins against equal-strength defender', () => {
      const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_HIGH)                                                                
      expect(result.attackerWon).toBe(true)                       
      expect(result.defenderHpFinal).toBe(0)                                                                                                                      
      expect(result.attackerHpFinal).toBeGreaterThan(0)           
    })                                                                                                                                                            
                                                                  
    it('defender wins when RAND_LOW (attacker never wins a round)', () => {                                                                                       
      const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, RAND_LOW)
      expect(result.attackerWon).toBe(false)                                                                                                                      
      expect(result.attackerHpFinal).toBe(0)                      
      expect(result.defenderHpFinal).toBeGreaterThan(0)                                                                                                           
    })                                                            
                                                                                                                                                                  
    it('both units take damage across rounds', () => {                                                                                                            
      // Use a rand that alternates: first round attacker wins, second defender wins, etc.
      let i = 0                                                                                                                                                   
      const altRand = () => (i++ % 2 === 0 ? 0.99 : 0.01)         
      const result = resolveCombat(makeCombatant(), makeCombatant({ civId: 2 }), false, altRand)                                                                  
      const totalDmgToDefender = result.rounds.reduce((s, r) => s + r.attackerDealt, 0)
      const totalDmgToAttacker = result.rounds.reduce((s, r) => s + r.defenderDealt, 0)                                                                           
      expect(totalDmgToDefender).toBeGreaterThan(0)               
      expect(totalDmgToAttacker).toBeGreaterThan(0)                                                                                                               
    })                                                            
                                                                                                                                                                  
    it('non-combat defender (strength 0) is captured instantly with 0 rounds', () => {                                                                            
      const nonCombat = makeCombatant({ baseStrength: 0, civId: 2 })
      const result = resolveCombat(makeCombatant(), nonCombat, false, RAND_HIGH)                                                                                  
      expect(result.attackerWon).toBe(true)                       
      expect(result.defenderCaptured).toBe(true)                                                                                                                  
      expect(result.rounds).toHaveLength(0)                                                                                                                       
      expect(result.attackerHpFinal).toBe(100)  // attacker unharmed
    })                                                                                                                                                            
  })                                                              
                                                                                                                                                                  
  describe('resolveCombat — strength ratios', () => {                                                                                                             
    it('strong attacker (10 str) almost always beats weak defender (1 str) with mid rand', () => {
      const strong = makeCombatant({ baseStrength: 10 })                                                                                                          
      const weak   = makeCombatant({ baseStrength: 1,  civId: 2 })
      // With a 10:1 ratio, win prob per round ≈ 91%; even 0.5 rand means attacker wins round                                                                     
      const result = resolveCombat(strong, weak, false, () => 0.5)                                                                                                
      expect(result.attackerWon).toBe(true)                                                                                                                       
    })                                                                                                                                                            
                                                                                                                                                                  
    it('weaker attacker can still win with lucky rand (pure randomness factor)', () => {                                                                          
      const weak   = makeCombatant({ baseStrength: 2 })
      const strong = makeCombatant({ baseStrength: 8, civId: 2 })                                                                                                 
      const result = resolveCombat(weak, strong, false, RAND_HIGH)
      expect(result.attackerWon).toBe(true)                                                                                                                       
    })                                                            
  })                                                                                                                                                              
                                                                  
  // ── computeModifiedStrength ────────────────────────────────────────────────────                                                                              
   
  describe('computeModifiedStrength — terrain bonuses', () => {                                                                                                   
    it('defender on Hill gains +25% effective strength', () => {  
      const defender = makeCombatant({ terrain: TerrainType.Hill })                                                                                               
      const opponent = makeCombatant({ civId: 2 })
      const str = computeModifiedStrength(defender, opponent, false, false)                                                                                       
      expect(str).toBeCloseTo(5 * 1.25, 2)  // base 5 × 1.25      
    })                                                                                                                                                            
                                                                  
    it('Forest feature gives defender +50% effective strength', () => {                                                                                           
      const defender = makeCombatant({ feature: FeatureType.Forest })
      const opponent = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(defender, opponent, false, false)
      expect(str).toBeCloseTo(5 * 1.50, 2)                                                                                                                        
    })                                                                                                                                                            
   
    it('Jungle feature gives defender +50% effective strength', () => {                                                                                           
      const defender = makeCombatant({ feature: FeatureType.Jungle })
      const opponent = makeCombatant({ civId: 2 })
      const str = computeModifiedStrength(defender, opponent, false, false)                                                                                       
      expect(str).toBeCloseTo(5 * 1.50, 2)
    })                                                                                                                                                            
                                                                  
    it('Mounted unit (noTerrainBonus) ignores Hill defense bonus', () => {                                                                                        
      const mounted = makeCombatant({ noTerrainBonus: true, terrain: TerrainType.Hill })
      const opponent = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(mounted, opponent, false, false)
      expect(str).toBeCloseTo(5, 2)  // no terrain bonus applied                                                                                                  
    })                                                            
                                                                                                                                                                  
    it('Hill + Forest defense bonuses stack additively', () => {                                                                                                  
      const defender = makeCombatant({ terrain: TerrainType.Hill, feature: FeatureType.Forest })
      const opponent = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(defender, opponent, false, false)
      expect(str).toBeCloseTo(5 * (1 + 0.25 + 0.50), 2)  // +75% total                                                                                            
    })                                                                                                                                                            
  })
                                                                                                                                                                  
  describe('computeModifiedStrength — unit type bonuses', () => { 
    it('Spearman gets +100% vs Mounted', () => {
      const spearman = makeCombatant({                                                                                                                            
        category: UnitCategory.Melee,
        combatBonuses: [{ vsCategory: UnitCategory.Mounted, pct: 100 }],                                                                                          
      })                                                          
      const knight = makeCombatant({ category: UnitCategory.Mounted, civId: 2 })                                                                                  
      const str = computeModifiedStrength(spearman, knight, true, false)                                                                                          
      expect(str).toBeCloseTo(5 * 2.0, 2)  // +100% = doubled
    })                                                                                                                                                            
                                                                  
    it('type bonus does not apply against wrong category', () => {                                                                                                
      const spearman = makeCombatant({                            
        combatBonuses: [{ vsCategory: UnitCategory.Mounted, pct: 100 }],                                                                                          
      })                                                                                                                                                          
      const archer = makeCombatant({ category: UnitCategory.Archery, civId: 2 })
      const str = computeModifiedStrength(spearman, archer, true, false)                                                                                          
      expect(str).toBeCloseTo(5, 2)                                                                                                                               
    })
  })                                                                                                                                                              
                                                                  
  describe('computeModifiedStrength — HP scaling', () => {
    it('unit at 50 HP fights at 50% effective strength', () => {
      const unit = makeCombatant({ currentHp: 50 })                                                                                                               
      const opp  = makeCombatant({ civId: 2 })                                                                                                                    
      const str = computeModifiedStrength(unit, opp, true, false)                                                                                                 
      expect(str).toBeCloseTo(2.5, 2)  // 5 × 0.5                                                                                                                 
    })                                                            
                                                                                                                                                                  
    it('unit at 1 HP still resolves without error (no divide-by-zero)', () => {                                                                                   
      const unit = makeCombatant({ currentHp: 1 })
      const opp  = makeCombatant({ civId: 2 })                                                                                                                    
      expect(() => computeModifiedStrength(unit, opp, true, false)).not.toThrow()
    })                                                                                                                                                            
  })
                                                                                                                                                                  
  describe('computeModifiedStrength — fortification', () => {     
    it('2 turns fortified gives +10% defense', () => {
      const defender = makeCombatant({ fortifyTurns: 2 })                                                                                                         
      const opponent = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(defender, opponent, false, false)                                                                                       
      expect(str).toBeCloseTo(5 * 1.10, 2)                                                                                                                        
    })                                                                                                                                                            
   
    it('5 turns fortified gives +25% defense', () => {                                                                                                            
      const defender = makeCombatant({ fortifyTurns: 5 })         
      const opponent = makeCombatant({ civId: 2 })
      const str = computeModifiedStrength(defender, opponent, false, false)                                                                                       
      expect(str).toBeCloseTo(5 * 1.25, 2)
    })                                                                                                                                                            
                                                                  
    it('fortification bonus does not apply to attackers', () => {                                                                                                 
      const attacker = makeCombatant({ fortifyTurns: 5 })  // was fortified, now attacking
      const defender = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(attacker, defender, true, false)
      expect(str).toBeCloseTo(5, 2)  // no fortify bonus                                                                                                          
    })                                                            
  })                                                                                                                                                              
                                                                  
  describe('computeModifiedStrength — city defense', () => {
    it('unit in city gets +25% flat city defense', () => {
      const defender = makeCombatant({ isInCity: true })                                                                                                          
      const opponent = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(defender, opponent, false, false)                                                                                       
      expect(str).toBeCloseTo(5 * 1.25, 2)                                                                                                                        
    })                                                                                                                                                            
   
    it('Swordsman gets +10% city attack bonus', () => {                                                                                                           
      const swordsman = makeCombatant({                           
        combatBonuses: [{ vsCity: true, pct: 10, onlyWhenAttacking: true }],                                                                                      
      })                                                                                                                                                          
      const cityDefender = makeCombatant({ isInCity: true, civId: 2 })                                                                                            
      const str = computeModifiedStrength(swordsman, cityDefender, true, false)                                                                                   
      expect(str).toBeCloseTo(5 * 1.10, 2)                        
    })                                                                                                                                                            
  })                                                              

  describe('computeModifiedStrength — river crossing', () => {                                                                                                    
    it('attacker crossing a river gets -25% penalty', () => {
      const attacker = makeCombatant()                                                                                                                            
      const defender = makeCombatant({ civId: 2 })                
      const strWithRiver    = computeModifiedStrength(attacker, defender, true, true)                                                                             
      const strWithoutRiver = computeModifiedStrength(attacker, defender, true, false)                                                                            
      expect(strWithRiver).toBeCloseTo(strWithoutRiver * 0.75, 2)
    })                                                                                                                                                            
                                                                  
    it('river penalty only applies to attacker, not defender', () => {                                                                                            
      const defender = makeCombatant()                            
      const attacker = makeCombatant({ civId: 2 })                                                                                                                
      const str = computeModifiedStrength(defender, attacker, false, true)
      expect(str).toBeCloseTo(5, 2)  // no penalty                                                                                                                
    })
  })                                                                                                                                                              
                                                                  
  // ── crossesRiver ──────────────────────────────────────────────────────────────                                                                               
   
  describe('crossesRiver', () => {                                                                                                                                
    function makeTileBytes(riverBitmask: number): Uint8Array {    
      const bytes = new Uint8Array(TILE_STRIDE * 4)  // 2×2 map                                                                                                   
      // Tile at (0, 0) = index 0                                                                                                                                 
      bytes[TILE_RIVER] = riverBitmask                                                                                                                            
      return bytes                                                                                                                                                
    }                                                                                                                                                             
                                                                  
    it('detects river on east edge when moving east', () => {                                                                                                     
      const bytes = makeTileBytes(RIVER_E)
      expect(crossesRiver(bytes, 2, 0, 0, 1, 0)).toBe(true)                                                                                                       
    })                                                                                                                                                            
   
    it('returns false for diagonal move regardless of river bits', () => {                                                                                        
      const bytes = makeTileBytes(0xFF)  // all river edges set   
      expect(crossesRiver(bytes, 2, 0, 0, 1, 1)).toBe(false)                                                                                                      
    })                                                            
                                                                                                                                                                  
    it('returns false when no river on the relevant edge', () => {                                                                                                
      const bytes = makeTileBytes(0)  // no rivers
      expect(crossesRiver(bytes, 2, 0, 0, 1, 0)).toBe(false)                                                                                                      
    })                                                                                                                                                            
  })
                                                                                                                                                                  
  ---                                                             
  7. Wire onCombat in main.ts
                                                                                                                                                                  
  In the GameCallbacks implementation in main.ts, add a no-op or basic logging handler:
  onCombat(event) {                                                                                                                                               
    // Optional: store.addCombatEvent(event) for UI display later 
    // For now: no-op — the unit HP changes and onUnitsChanged handle visual refresh                                                                              
  }                                                                                                                                                               
                                                                                                                                                                  
  ---                                                                                                                                                             
  Summary of files to create/modify                                                                                                                               
                                                                                                                                                                  
  ┌────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ Action │                                                        File                                                         │                                
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Modify │ src/shared/types.ts — add UnitCategory, CombatBonus, extend UnitDef                                                 │
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Modify │ src/data/units.ts — add categories/bonuses + FEATURE_DEFENSE_BONUS export                                           │                                
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                
  │ Create │ src/game/combat/types.ts                                                                                            │                                
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                
  │ Create │ src/game/combat/combat.ts                                                                                           │
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                
  │ Create │ src/game/combat/__tests__/combat.test.ts                                                                            │
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Modify │ src/game/Game.ts — setRand, _fortifyTurns, _fortifiedUids, helpers, _doAttack, _executeStep, _moveRandom, _passable │
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                
  │ Modify │ src/game/Game.ts — GameCallbacks.onCombat                                                                           │
  ├────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                
  │ Modify │ main.ts — wire the onCombat callback                                                                                │
  └────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘                                
                                                                  
  Type-check with npx tsc --noEmit after implementation. Run tests with npx vitest run src/game/combat.                                                           
                                                                  