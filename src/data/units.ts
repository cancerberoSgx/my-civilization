import { UnitTypeId, type UnitDef } from '../shared/types'

export const UNIT_DEFS: UnitDef[] = [
  { id: UnitTypeId.Warrior,   name: 'Warrior',   letter: 'W', strength: 2,  movement: 1, isNaval: false },
  { id: UnitTypeId.Archer,    name: 'Archer',    letter: 'A', strength: 3,  movement: 1, isNaval: false },
  { id: UnitTypeId.Settler,   name: 'Settler',   letter: 'S', strength: 0,  movement: 2, isNaval: false },
  { id: UnitTypeId.Worker,    name: 'Worker',    letter: 'K', strength: 0,  movement: 2, isNaval: false },
  { id: UnitTypeId.Spearman,  name: 'Spearman',  letter: 'P', strength: 4,  movement: 1, isNaval: false },
  { id: UnitTypeId.Swordsman, name: 'Swordsman', letter: 'X', strength: 6,  movement: 1, isNaval: false },
  { id: UnitTypeId.Knight,    name: 'Knight',    letter: 'N', strength: 8,  movement: 2, isNaval: false },
  { id: UnitTypeId.Catapult,  name: 'Catapult',  letter: 'C', strength: 5,  movement: 1, isNaval: false },
  { id: UnitTypeId.Galley,    name: 'Galley',    letter: 'G', strength: 3,  movement: 3, isNaval: true  },
  { id: UnitTypeId.Scout,     name: 'Scout',     letter: 'O', strength: 1,  movement: 2, isNaval: false },
]

export const UNIT_MAP = new Map(UNIT_DEFS.map(u => [u.id, u]))
