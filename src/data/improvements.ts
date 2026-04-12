import { ImprovementType, type ImprovementDef } from '../shared/types'

export const IMPROVEMENT_DEFS: ImprovementDef[] = [
  { id: ImprovementType.Farm,        name: 'Farm',         color: 0xa0e060 },
  { id: ImprovementType.Mine,        name: 'Mine',         color: 0xb0b080 },
  { id: ImprovementType.Pasture,     name: 'Pasture',      color: 0xc8e080 },
  { id: ImprovementType.Plantation,  name: 'Plantation',   color: 0x60b040 },
  { id: ImprovementType.Camp,        name: 'Camp',         color: 0xa06030 },
  { id: ImprovementType.FishingBoat, name: 'Fishing Boat', color: 0x40b0c0 },
]

export const IMPROVEMENT_MAP = new Map(IMPROVEMENT_DEFS.map(i => [i.id, i]))
