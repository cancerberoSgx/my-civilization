import { describe, it, expect } from 'vitest'
import { UnitTypeId } from '../../../shared/types'
import {
  getBuildingDef,
  getUnitDef,
  BUILDING_MAP,
  UNIT_DEF_MAP,
  B_GRANARY,
  B_LIBRARY,
  B_BARRACKS,
  B_FORGE,
  B_MARKET,
  B_AQUEDUCT,
  B_COURTHOUSE,
  B_COLOSSEUM,
} from '../definitions'
import { SpecialistType } from '../types'

// ── getBuildingDef ────────────────────────────────────────────────────────────

describe('getBuildingDef', () => {
  it('returns the correct definition for a known building', () => {
    const def = getBuildingDef(B_GRANARY)
    expect(def.id).toBe(B_GRANARY)
    expect(def.name).toBe('Granary')
    expect(def.granaryEffect).toBe(true)
    expect(def.cost).toBeGreaterThan(0)
  })

  it('throws for an unknown building ID', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getBuildingDef('nonexistent' as any)).toThrow()
  })

  it('all 8 canonical buildings are registered', () => {
    const expected = [
      B_GRANARY, B_LIBRARY, B_BARRACKS, B_MARKET,
      B_FORGE, B_AQUEDUCT, B_COURTHOUSE, B_COLOSSEUM,
    ]
    for (const id of expected) {
      expect(() => getBuildingDef(id)).not.toThrow()
    }
  })

  it('Library has +25% science and 2 Scientist slots', () => {
    const lib = getBuildingDef(B_LIBRARY)
    expect(lib.percentYields.science).toBe(25)
    const slot = lib.specialistSlots.find(s => s.type === SpecialistType.Scientist)
    expect(slot?.count).toBe(2)
  })

  it('Barracks has barracksEffect and a defense bonus', () => {
    const bar = getBuildingDef(B_BARRACKS)
    expect(bar.barracksEffect).toBe(true)
    expect(bar.defenseBonus).toBeGreaterThan(0)
  })

  it('Courthouse has courthouseEffect', () => {
    expect(getBuildingDef(B_COURTHOUSE).courthouseEffect).toBe(true)
  })

  it('Forge has +25% production and an Engineer slot', () => {
    const forge = getBuildingDef(B_FORGE)
    expect(forge.percentYields.production).toBe(25)
    const slot = forge.specialistSlots.find(s => s.type === SpecialistType.Engineer)
    expect(slot?.count).toBeGreaterThanOrEqual(1)
  })
})

// ── BUILDING_MAP ──────────────────────────────────────────────────────────────

describe('BUILDING_MAP', () => {
  it('every entry round-trips through getBuildingDef', () => {
    for (const [id, def] of BUILDING_MAP) {
      expect(getBuildingDef(id)).toBe(def)
    }
  })
})

// ── getUnitDef ────────────────────────────────────────────────────────────────

describe('getUnitDef', () => {
  it('returns the correct definition for Warrior', () => {
    const def = getUnitDef(UnitTypeId.Warrior)
    expect(def.typeId).toBe(UnitTypeId.Warrior)
    expect(def.name).toBe('Warrior')
    expect(def.cost).toBeGreaterThan(0)
    expect(def.prerequisites.buildings).toHaveLength(0)
  })

  it('throws for a non-producible unit type (City)', () => {
    expect(() => getUnitDef(UnitTypeId.City)).toThrow()
  })

  it('all 6 required unit types are registered', () => {
    const required = [
      UnitTypeId.Warrior,
      UnitTypeId.Archer,
      UnitTypeId.Swordsman,
      UnitTypeId.Settler,
      UnitTypeId.Worker,
      UnitTypeId.Galley,
    ]
    for (const typeId of required) {
      expect(() => getUnitDef(typeId)).not.toThrow()
    }
  })

  it('Swordsman requires the Barracks', () => {
    const sw = getUnitDef(UnitTypeId.Swordsman)
    expect(sw.prerequisites.buildings).toContain(B_BARRACKS)
  })

  it('Settler has a higher cost than Warrior', () => {
    expect(getUnitDef(UnitTypeId.Settler).cost).toBeGreaterThan(
      getUnitDef(UnitTypeId.Warrior).cost,
    )
  })
})

// ── UNIT_DEF_MAP ──────────────────────────────────────────────────────────────

describe('UNIT_DEF_MAP', () => {
  it('every entry round-trips through getUnitDef', () => {
    for (const [typeId, def] of UNIT_DEF_MAP) {
      expect(getUnitDef(typeId)).toBe(def)
    }
  })
})
